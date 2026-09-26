# Post-mortem of one video

Goal: explain how one video performed and turn it into one change for the
next video.

## Steps

1. **Identify the video.** Use the ID if given. Otherwise call
   `yt_top_videos` over the last 90 days with `resolve_titles: true` and
   `max_results: 50`, and match the title; if two match, ask.
2. **Age.** Call `yt_episode_race` with `video_ids: [<id>, <any other
   recent id>]` and read the video's `publishedAt` and `ageDays` (the tool
   needs two IDs; ignore the second). Under 7 days old → say the result is
   provisional; continue only if the user wants it now.
3. **Totals.** `yt_video_performance` from the publish date to three days
   ago, metrics: views, engagedViews, estimatedMinutesWatched,
   averageViewDuration, averageViewPercentage, subscribersGained, likes,
   comments, shares.
4. **Reach and format.** `yt_traffic_sources` with `video_id`. If
   `SHORTS` is among its sources the video is a Short — judge it by the
   Shorts column; otherwise by the long-form column. Then call it again
   with `split_by: "subscribed_status"`.
5. **Where from, in detail.** For the largest source that has a detail
   report (not `SHORTS`), call `yt_traffic_source_detail` with that
   `source_type` and the `video_id`. For Shorts, `YT_SEARCH` and `EXT_URL`
   are usually the informative ones.
6. **Retention.** `yt_audience_retention` for the video, both
   `audienceWatchRatio` and `relativeRetentionPerformance`. Read the first
   points (the hook), the middle, and the end. Name any sharp drop and its
   position.
7. **Against its peers.** `yt_episode_race` with this video and the
   previous 3–5 videos of the same format, `window_days` = this video's age
   (max 28). Where does it rank at the shared age?
8. **Studio-only numbers.** Ask once: Shorts → "Viewed vs. swiped away" %;
   long-form → impressions and impressions CTR.
9. **Write** the output template from SKILL.md. Title:
   `Post-mortem: <title> (<publish date> → <end date>, <format>)`.

## What to look for

- Reach vs. retention: many feed/browse views with weak retention is a
  content or hook problem; few feed views with strong retention is a
  testing/reach problem — the audience that saw it liked it.
- The hook: first-point retention and engagedViews/views against the
  channel's own previous videos, not against an absolute.
- Who it reached: unsubscribed share; search terms that reveal intent the
  title or topic could target.
- The one action follows the weakest link with the strongest evidence.
