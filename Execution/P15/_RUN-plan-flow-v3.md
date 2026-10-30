# Plan flow v3: overnight run log

Three lines per batch: branch shas, tests and end check, user rows raised.

- Batch A (T855 to T856), branch p15-plan-flow-v3-a: app a46b6db (from master d195640), root sync f43ed8b7a plus the report commit (from main d392962b9).
- npm test 1039 of 1039; end check walk-a.mjs on the NOPUBLIC builds at 1440 and 375: after 37 of 37, before 17 of 37 (every failure a fixed bug); T802-c closed by T855.
- User rows raised: T855-a (nearest-day flight vs the trip's dates), T856-a (finder flight wins over the way of travel), T856-b (coach or car at any distance).
