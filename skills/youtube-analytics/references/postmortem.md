# Post-mortem of one video

Goal: explain how one video performed and turn it into one change for the
next video.

## Steps

1. **Identify the video.** Use the ID if given. Otherwise call
   `yt_top_videos` over the last 90 days with `resolve_titles: true` and
   `max_results: 50`, and match the title; if two match, ask.
2. **Age.** `yt_episode_race` needs 2–10 IDs: pass this video plus one
   other ID from `yt_top_videos` (last 90 days). Read this video's
   `publishedAt` and `ageDays`. Analytics settles about 3 days late, so a
   video published fewer than 10 days ago has under 7 days of settled
   data → label the result provisional, and continue only if the user
   wants it now. Analysis window: publish date → three days ago.
3. **Format.** `yt_traffic_sources` with `video_id` and
   `content_type: "shorts"`: any rows → it is a Short (judge by the Shorts
   column), none → long-form. Do not infer the format from the `SHORTS`
   traffic source — a Short the feed never tested can have none.
4. **Totals.** `yt_video_performance` over the window, metrics: views,
   engagedViews, estimatedMinutesWatched, averageViewDuration,
   averageViewPercentage, subscribersGained, likes, comments, shares.
5. **Reach.** `yt_traffic_sources` with `video_id`. Then again with
   `split_by: "subscribed_status"`.
6. **Where from, in detail.** Take the largest source that has a detail
   report — only `YT_SEARCH`, `EXT_URL`, `YT_CHANNEL`, `RELATED_VIDEO`,
   `SUBSCRIBER`, `ADVERTISING`, `HASHTAGS`, `YT_OTHER_PAGE` do — and call
   `yt_traffic_source_detail` with that `source_type` and the `video_id`.
7. **Retention.** `yt_audience_retention` with `video_id`, the window's
   dates, and `sample_every: 1` (one point per 1% of runtime; the default
   of 5 skips most of a Short's hook). Read: the first ~5 points (the
   hook), `relativeRetentionPerformance` at ratio 0.10, the middle, the end.
   Name any sharp drop and its position. No rows (the video is under
   YouTube's watch-time threshold) → put it under Data gaps and skip the
   retention reasoning.
8. **Against its peers.** Take up to 10 recent candidate IDs of the same
   format from `yt_top_videos` (`content_type`, last 90 days,
   `max_results: 50`). Get their publish dates with `yt_episode_race` in
   batches of at most 10 IDs. Race this video against the 3–5 published
   just before it, `window_days` = this video's age (max 28), leaving out
   any younger than 3 days. Where does it rank at the shared age? With fewer
   than 3 peers, say the comparison is weak rather than drawing a ranking
   conclusion from it.
9. **Studio-only numbers.** If `yt_reach` has coverage for the window, take
   impressions and CTR from it (`group_by: "video"`, `video_id`) and ask
   Studio only for what is still missing. Otherwise ask once: Shorts → "Viewed vs. swiped away" %;
   long-form → impressions and impressions CTR.
10. **Write** the output template from SKILL.md. Title:
    `Post-mortem: <title> (<publish date> → <end date>, <format>)`.

## What to look for

- Reach vs. retention: many feed/browse views with weak retention is a
  content or hook problem; few feed views with strong retention is a
  testing/reach problem — the audience that saw it liked it.
- The hook: the first retention points and engagedViews/views against the
  channel's own previous videos, not against an absolute.
- Who it reached: unsubscribed share; search terms that reveal intent the
  title or topic could target.
- The one action follows the weakest link with the strongest evidence.
