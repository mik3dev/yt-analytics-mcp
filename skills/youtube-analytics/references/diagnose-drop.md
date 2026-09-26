# Diagnose a drop

Goal: find why views (or watch time, or subscribers) fell, and classify the
cause as one of four.

## Steps

1. **Locate the drop.** `yt_channel_overview` with `group_by: "day"` over
   the last ~60 days ending three days ago, metric views (plus the metric
   the user named). Find the day the level changed; call the days before
   "before" and after "after", equal lengths.
2. **Format.** Same window with `split_by: "content_type"`: did one format
   drop or both?
3. **By source.** `yt_traffic_sources` for "before" and "after".
4. **By video.** `yt_top_videos` for both periods (`resolve_titles: true`).
   Separate views from videos published in the period from views of older
   videos.
5. **New uploads' start.** `yt_episode_race` with the uploads of both
   periods, `window_days` 7 — did new videos start weaker?
6. **Retention of new uploads.** `yt_video_performance` for them
   (averageViewPercentage) against the "before" uploads.
7. **Classify** — name one, with its evidence:
   - **Reach** — the main source (feed or browse) shrank on new uploads;
     their early views fell while their retention held.
   - **Retention** — new uploads' averageViewPercentage / early retention
     fell; reach followed.
   - **Cadence** — fewer uploads in "after"; per-video numbers held.
   - **One-off ended** — "before" was lifted by one video or one external
     share (`EXT_URL` detail) that ran out.
8. **Studio-only numbers.** Ask once for "Viewed vs. swiped away" (Shorts)
   or impressions CTR (long-form) on the new uploads.
9. **Write** the output template. Title:
   `Drop diagnosis: <metric> since <date> (<format>)`.

## What to look for

- A drop on day 1 of a new upload that never took off is reach, not
  channel decline.
- Two causes can stack; name the primary one and mention the second.
