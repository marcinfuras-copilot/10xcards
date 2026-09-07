#!/usr/bin/env bash
# Migrates context/foundation/roadmap.md's Foundations/Slices into GitHub Issues,
# labels, a milestone, and a Project (v2) board. Idempotent — safe to re-run.
set -euo pipefail

OWNER="marcinfuras-copilot"
REPO="10xcards"
OWNER_REPO="$OWNER/$REPO"
MILESTONE_TITLE="10xCards MVP"
PROJECT_TITLE="10xCards Roadmap"
ROADMAP_FILE="context/foundation/roadmap.md"

echo "== 1. Labels =="
gh label create roadmap --repo "$OWNER_REPO" --force \
  --description "Migrated from $ROADMAP_FILE" --color "6F42C1"
gh label create foundation --repo "$OWNER_REPO" --force \
  --description "Non-user-facing foundational/infra work" --color "5319E7"
gh label create slice --repo "$OWNER_REPO" --force \
  --description "Vertical, end-to-end user-facing slice" --color "1D76DB"
gh label create north-star --repo "$OWNER_REPO" --force \
  --description "The roadmap's north-star milestone" --color "FBCA04"
gh label create "status:ready" --repo "$OWNER_REPO" --force \
  --description "Ready for /10x-plan" --color "0E8A16"
gh label create "status:proposed" --repo "$OWNER_REPO" --force \
  --description "Proposed; blocked on a prerequisite landing first" --color "D93F0B"

echo "== 2. Milestone =="
EXISTING_MS=$(gh api "repos/$OWNER_REPO/milestones?state=all" \
  --jq ".[] | select(.title==\"$MILESTONE_TITLE\") | .number")
if [ -z "$EXISTING_MS" ]; then
  gh api "repos/$OWNER_REPO/milestones" \
    -f title="$MILESTONE_TITLE" -f state="open" \
    -f description="MVP scope migrated from $ROADMAP_FILE: F-01 unlocks S-01 (north star), S-02, S-03." \
    --jq '.number' >/dev/null
  echo "Created milestone: $MILESTONE_TITLE"
else
  echo "Milestone already exists: #$EXISTING_MS"
fi

echo "== 3. Issues =="
find_issue_by_change_id() {
  # Anchored on the literal "**Change ID:** `<id>`" line so this only matches
  # the issue that OWNS the change id, not siblings that merely reference it
  # (e.g. a slice's "Blocked by #1 (`flashcards-data-foundation`)" line).
  local anchor="**Change ID:** \`${1}\`"
  gh issue list --repo "$OWNER_REPO" --state all --json number,body \
    | jq -r --arg anchor "$anchor" '[.[] | select(.body | contains($anchor))][0].number // empty'
}

F01_NUM=$(find_issue_by_change_id "flashcards-data-foundation")
if [ -z "$F01_NUM" ]; then
  F01_URL=$(gh issue create --repo "$OWNER_REPO" \
    --title "Add flashcards data schema + RLS foundation" \
    --milestone "$MILESTONE_TITLE" \
    --label "roadmap,foundation,status:ready" \
    --body-file - <<'EOF'
## Outcome

(foundation) a flashcards table exists with row-level security scoped to the owning user, and the minimal fields needed to track review state (accepted/edited) and spaced-repetition scheduling. Per the PRD's data-retention NFR, it stores the derived question/answer pair, not the raw pasted source text.

## Details

- **Change ID:** `flashcards-data-foundation`
- **PRD refs:** Access Control (flat user model, own-data-only), data-retention NFR ("source text ... not retained or used beyond that purpose")
- **Prerequisites:** — (auth already present per Baseline, providing the `user_id` to key RLS on)
- **Parallel with:** —
- **Blockers:** —
- **Risk:** Kept intentionally minimal — just enough schema to unblock S-01 — rather than pre-designing every field an eventual SR-library integration might want.
- **Status:** `ready`

---
Source of truth: [`context/foundation/roadmap.md`](../blob/main/context/foundation/roadmap.md) — Roadmap ID `F-01`
EOF
)
  F01_NUM=$(basename "$F01_URL")
  echo "Created F-01 -> #$F01_NUM"
else
  echo "F-01 already exists -> #$F01_NUM"
fi

create_or_get_slice() {
  local change_id="$1" title="$2" labels="$3" prd_refs="$4" outcome="$5" risk="$6" blockers="$7"
  local existing
  existing=$(find_issue_by_change_id "$change_id")
  if [ -n "$existing" ]; then
    echo "$existing"
    return
  fi
  local body url
  body=$(cat <<EOF
## Outcome

$outcome

## Details

- **Change ID:** \`$change_id\`
- **PRD refs:** $prd_refs
- **Prerequisites:** Blocked by #$F01_NUM (\`flashcards-data-foundation\`)
- **Parallel with:** PARALLEL_PLACEHOLDER
- **Blockers:** $blockers
- **Risk:** $risk
- **Status:** \`proposed\`

---
Source of truth: [\`context/foundation/roadmap.md\`](../blob/main/context/foundation/roadmap.md) — Roadmap ID \`$change_id\`
EOF
)
  url=$(gh issue create --repo "$OWNER_REPO" \
    --title "$title" \
    --milestone "$MILESTONE_TITLE" \
    --label "$labels" \
    --body "$body")
  basename "$url"
}

S01_NUM=$(create_or_get_slice "ai-generate-review-study-loop" \
  "AI generate → review → save → study loop (north star)" \
  "roadmap,slice,north-star,status:proposed" \
  "US-01, FR-001, FR-002, FR-003, FR-004, FR-009" \
  "user can paste source text, receive AI-generated flashcard candidates, review each one (accept/edit/reject), have accepted cards saved to their account, and start a spaced-repetition study session over them." \
  "Bundles the two heaviest FRs (AI generation + SR integration) into one slice, deliberately, as the north star." \
  "Possible need to upgrade to the \$5/mo Cloudflare Workers paid plan before this route carries real traffic — the free tier's 10ms CPU cap is a real risk for AI-response parsing.")

S02_NUM=$(create_or_get_slice "manual-flashcard-creation" \
  "Manual flashcard creation" \
  "roadmap,slice,status:proposed" \
  "FR-005" \
  "user can manually create a flashcard directly, without going through AI generation." \
  "Smallest, most isolated slice — a pressure-release valve if capacity is tighter than expected." \
  "—")

S03_NUM=$(create_or_get_slice "flashcard-management-list" \
  "Flashcard list: view, edit, delete" \
  "roadmap,slice,status:proposed" \
  "FR-006, FR-007, FR-008" \
  "user can browse their saved flashcards, edit an existing one, and delete one." \
  "Grouped as one slice per PRD's own FR-006/007/008 grouping; view/edit/delete naturally share a single list UI." \
  "—")

echo "S-01 -> #$S01_NUM, S-02 -> #$S02_NUM, S-03 -> #$S03_NUM"

echo "== 4. Backfill 'Parallel with' cross-links =="
backfill_parallel() {
  local num="$1" links="$2"
  local current new
  current=$(gh issue view "$num" --repo "$OWNER_REPO" --json body -q .body)
  new=$(printf '%s' "$current" | sed "s/PARALLEL_PLACEHOLDER/$links/")
  if [ "$current" != "$new" ]; then
    gh issue edit "$num" --repo "$OWNER_REPO" --body "$new"
    echo "Backfilled parallel-with on #$num"
  else
    echo "#$num already backfilled"
  fi
}
backfill_parallel "$S01_NUM" "#$S02_NUM (\`manual-flashcard-creation\`), #$S03_NUM (\`flashcard-management-list\`)"
backfill_parallel "$S02_NUM" "#$S01_NUM (\`ai-generate-review-study-loop\`), #$S03_NUM (\`flashcard-management-list\`)"
backfill_parallel "$S03_NUM" "#$S01_NUM (\`ai-generate-review-study-loop\`), #$S02_NUM (\`manual-flashcard-creation\`)"

echo "== 5. Project (v2) board =="
PROJECT_NUM=$(gh project list --owner "$OWNER" --format json \
  --jq ".projects[] | select(.title==\"$PROJECT_TITLE\") | .number" || true)
if [ -z "${PROJECT_NUM:-}" ]; then
  PROJECT_JSON=$(gh project create --owner "$OWNER" --title "$PROJECT_TITLE" --format json)
  PROJECT_NUM=$(echo "$PROJECT_JSON" | jq -r .number)
  PROJECT_ID=$(echo "$PROJECT_JSON" | jq -r .id)
  echo "Created project #$PROJECT_NUM"
else
  PROJECT_ID=$(gh project view "$PROJECT_NUM" --owner "$OWNER" --format json --jq .id)
  echo "Project already exists: #$PROJECT_NUM"
fi

FIELD_JSON=$(gh project field-list "$PROJECT_NUM" --owner "$OWNER" --format json \
  --jq '.fields[] | select(.name=="Roadmap Status")')
if [ -z "$FIELD_JSON" ]; then
  FIELD_JSON=$(gh project field-create "$PROJECT_NUM" --owner "$OWNER" \
    --name "Roadmap Status" --data-type SINGLE_SELECT \
    --single-select-options "Ready,Proposed,Blocked" --format json)
  echo "Created 'Roadmap Status' field"
else
  echo "'Roadmap Status' field already exists"
fi
FIELD_ID=$(echo "$FIELD_JSON" | jq -r .id)
READY_OPT=$(echo "$FIELD_JSON" | jq -r '.options[] | select(.name=="Ready") | .id')
PROPOSED_OPT=$(echo "$FIELD_JSON" | jq -r '.options[] | select(.name=="Proposed") | .id')

add_to_project_with_status() {
  local issue_url="$1" option_id="$2"
  local item_id
  item_id=$(gh project item-list "$PROJECT_NUM" --owner "$OWNER" --format json \
    --jq ".items[] | select(.content.url==\"$issue_url\") | .id")
  if [ -z "$item_id" ]; then
    item_id=$(gh project item-add "$PROJECT_NUM" --owner "$OWNER" --url "$issue_url" --format json --jq .id)
    echo "Added $issue_url to project"
  fi
  gh project item-edit --id "$item_id" --field-id "$FIELD_ID" --project-id "$PROJECT_ID" \
    --single-select-option-id "$option_id" >/dev/null
}

add_to_project_with_status "https://github.com/$OWNER_REPO/issues/$F01_NUM" "$READY_OPT"
add_to_project_with_status "https://github.com/$OWNER_REPO/issues/$S01_NUM" "$PROPOSED_OPT"
add_to_project_with_status "https://github.com/$OWNER_REPO/issues/$S02_NUM" "$PROPOSED_OPT"
add_to_project_with_status "https://github.com/$OWNER_REPO/issues/$S03_NUM" "$PROPOSED_OPT"

PROJECT_URL=$(gh project view "$PROJECT_NUM" --owner "$OWNER" --format json --jq .url)
echo "Project board: $PROJECT_URL"
echo "NOTE: gh CLI cannot set a Board view's 'group by' field — open the project once and group its Board view by 'Roadmap Status' manually."

echo "== Done =="
echo "F01=$F01_NUM S01=$S01_NUM S02=$S02_NUM S03=$S03_NUM PROJECT=$PROJECT_NUM"
