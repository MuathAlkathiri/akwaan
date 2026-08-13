#!/usr/bin/env python3
"""Exercise valid modes and required invalid Distributed Information cases."""
from __future__ import annotations
import copy, json, sys
from pathlib import Path
from validate_distributed_information import validate

ROOT=Path(__file__).resolve().parents[2]
EX=ROOT/'.opencode/validators/examples'
VALID=[EX/'distributed-information-closest.valid.json',EX/'distributed-information-match.valid.json',EX/'distributed-information-multiple-choice.valid.json']
base=json.loads(VALID[1].read_text())

def case(fn):
    item=copy.deepcopy(base); fn(item); return item

CASES={
 'two_segments':case(lambda x:x['mechanicPayload']['segments'].pop()),
 'duplicate_segment_content':case(lambda x:x['mechanicPayload']['segments'][1]['content'].update(ar=x['mechanicPayload']['segments'][0]['content']['ar'])),
 'merge_omits_segment':case(lambda x:x['mechanicPayload']['twoPlayerMergeOptions'][0].update(firstParticipantSegmentIds=['A'],secondParticipantSegmentIds=['B'])),
 'one_player_all_three':case(lambda x:x['mechanicPayload']['twoPlayerMergeOptions'][0].update(firstParticipantSegmentIds=['A','B','C'],secondParticipantSegmentIds=[])),
 'unsupported_team_size':case(lambda x:x['mechanicPayload'].update(supportedTeamSizes=[2,4])),
 'missing_safety':case(lambda x:x['mechanicPayload'].pop('authorSafetyConfirmation')),
 'truth_in_mechanic':case(lambda x:x['mechanicPayload'].update(correctAnswer='hidden')),
 'runtime_field_in_mechanic':case(lambda x:x['mechanicPayload'].update(hint='لا توجد تلميحات في النظام')),
 'segment_exposes_truth':case(lambda x:x['mechanicPayload']['segments'][0]['content'].update(ar='كاكاشي هاتاكي')),
 'public_exposes_private':case(lambda x:x['mechanicPayload']['publicPrompt'].update(ar=x['mechanicPayload']['segments'][0]['content']['ar'])),
 'public_truth_leakage':case(lambda x:x['mechanicPayload']['publicPrompt'].update(ar='الجملة الصحيحة هي كاكاشي هاتاكي')),
 'notes_payload_hack':case(lambda x:x['metadata'].update(notes={'payload':'bad'})),
 'candidate_singleton_segment':case(lambda x:x['mechanicPayload'].update(candidateSets={'A':['كاكاشي هاتاكي','ناروتو أوزوماكي'],'B':['كاكاشي هاتاكي','ساسكي أوتشيها'],'C':['كاكاشي هاتاكي']})),
 'candidate_merge_AB_ambiguous':case(lambda x:x['mechanicPayload'].update(candidateSets={'A':['كاكاشي هاتاكي','ناروتو أوزوماكي'],'B':['ناروتو أوزوماكي','ساسكي أوتشيها'],'C':['كاكاشي هاتاكي','ساسكي أوتشيها']})),
 'candidate_triple_not_unique':case(lambda x:x['mechanicPayload'].update(candidateSets={'A':['كاكاشي هاتاكي','ناروتو أوزوماكي'],'B':['كاكاشي هاتاكي','ناروتو أوزوماكي'],'C':['كاكاشي هاتاكي','ناروتو أوزوماكي']})),
}

failed=False
declared=json.loads((EX/'distributed-information.invalid-fixtures.json').read_text())['cases']
if {x['id'] for x in declared} != set(CASES): failed=True; print('FAIL invalid fixture registry')
for path in VALID:
    errors=validate(json.loads(path.read_text()))
    if errors: failed=True; print('FAIL valid',path.name,errors)
for name,item in CASES.items():
    errors=validate(item)
    expected=next(x['expected'] for x in declared if x['id']==name)
    if expected not in errors: failed=True; print('FAIL invalid accepted',name,errors)
if failed: sys.exit(1)
print(f'PASS distributed-information fixtures valid={len(VALID)} invalid={len(CASES)}')
