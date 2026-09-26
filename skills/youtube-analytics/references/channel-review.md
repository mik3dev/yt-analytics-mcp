# Periodic channel review

Goal: how the channel did over a period, what changed against the previous
period, and one change to make.

## Steps

1. **Window.** Default: the last 28 complete days ending three days ago;
   accept a week, a month, or explicit dates. The comparison period is the
   same length immediately before.
2. **Format mix.** `yt_channel_overview` for both periods with
   `split_by: "content_type"`. If a format has no views in either period,
   say the channel is single-format and skip the other format's column.
3. **Trend.** `yt_channel_overview` for the current period with
   `group_by: "day"` (or `"month"` for ranges over ~90 days, whole months
   only), metrics views, engagedViews, estimatedMinutesWatched,
   subscribersGained.
4. **What carried it.** `yt_top_videos` for the current period, per format
   (`content_type`), `max_results: 10`, `resolve_titles: true`.
5. **Where from.** `yt_traffic_sources` for both periods (per format when
   the channel is mixed).
6. **Audience.** `yt_channel_overview` for the current period with
   `split_by: "subscribed_status"`.
7. **Studio-only numbers.** Ask once for the period's impressions CTR
   (long-form) or average "Viewed vs. swiped away" (Shorts), if the user
   tracks them.
8. **Write** the output template. Title:
   `Channel review: <channel> (<start> → <end> vs. previous <n> days, <formats>)`.

## What to look for

- Deltas, not levels: views, watch time, subscribers per format versus the
  previous period, as % change.
- Concentration: share of views from the top video. One video carrying
  most of the period hides a weak baseline.
- Source shifts: a source whose share moved by more than a few points.
- Upload count in each period (from `yt_top_videos` publish dates via
  `yt_episode_race` if needed) — fewer uploads alone can explain a drop.
