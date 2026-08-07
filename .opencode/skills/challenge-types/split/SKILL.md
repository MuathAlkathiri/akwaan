---
name: challenge-type-split
description: اقسمها; a fast deterministic classification mechanic for two or three groups.
---

# ChallengeType: Split / اقسمها

## Experience Goal
Create fast classification, coordination, and lively discussion.

## Social Dynamic
Players jointly place visible items into clear groups under time pressure.

## Player Emotion
Recognition, productive confusion, urgency, correction, and shared relief.

## Interaction Pattern
Reveal item set and group labels → classify → lock → automatic group reveal.

## Thinking Pattern
Compare, distinguish, classify, group, and sequence.

## Success Pattern
Six to ten familiar items create several quick decisions and at least a few
worth discussing without relying on obscurity.

## Failure Pattern
Overlapping membership, arbitrary labels, disputed classification, or human
interpretation makes the set non-resolvable.

## Input Contract
Submit exactly one group ID per item ID before lock.

## Resolution Contract
Compare the complete item-to-group map against the stored canonical mapping.
Score per runtime configuration through the shared scoring registry.

## Content Structure
One ContentItem set of six to ten items, with two or three understandable groups. Ordered
groups additionally declare deterministic positions.

## Allowed Content Patterns
- `two-groups`
- `three-groups`
- `ordered-groups`

## Content Safety Rules
Avoid demeaning labels, sensitive personal classification, disputed identity,
and groups that stereotype people.

## Media Compatibility
Text and images are preferred. Audio or video is allowed only when each item is
clear, comparable, and machine-mappable. Media is optional.

## Scope Compatibility
The Scope must provide enough non-overlapping entities or concepts. Respect all
excluded ChallengeTypes and Pattern exclusions.

## Validation Rules
Verify unique membership, label clarity, balanced groups, six-to-ten count,
automatic mapping, source support, safe wording, and interaction value.

## Anti-patterns
Obscure release-year sorting, arbitrary buckets, overlapping membership, one
obvious item among obscure items, unbalanced singleton groups, or human judging.
