# Reading the numbers

Heuristics, not laws. Every threshold below is a rule of thumb for a
channel's own history — say so when you use one.

## Metrics

- **views** — plays. On Shorts every loop and replay counts.
- **engagedViews** — plays past the first few seconds. On Shorts,
  `engagedViews / views` is the closest API proxy for "did not swipe
  away".
- **estimatedMinutesWatched** — total watch time.
- **averageViewDuration** — seconds per view.
- **averageViewPercentage** — share of the video watched per view. Above
  100% means rewatching, common on Shorts.
- **audienceWatchRatio** (retention curve) — share of viewers still
  watching at each point, 0 to 1 of the video's length. Above 1 means
  rewatching of that section.
- **relativeRetentionPerformance** — 0 to 1, the video's retention at that
  point against videos of similar length on YouTube. 0.5 is typical.
- **subscribersGained / subscribersLost**, **likes**, **comments**,
  **shares** — engagement. Small numbers; read them as signals, not
  scores.

## Shorts

- **Discovery is the Shorts feed.** Traffic source `SHORTS` should carry
  most views — as a rule of thumb above ~70%. When it is low or its raw
  count is small (tens of views), the feed stopped testing the video;
  that is a reach problem, usually decided by the first seconds.
- **The hook** — no single API metric. Read together: `engagedViews /
  views`, `audienceWatchRatio` at the first points of the curve, and
  `relativeRetentionPerformance` at ratio 0.10. Request the curve with
  `sample_every: 1`; the default of 5 skips most of a Short's hook. Studio's "Viewed vs. swiped
  away" is the real number — ask for it.
- **Retention** — averageViewPercentage near or above 100% is strong;
  well below ~70% means most viewers leave early.
- **Who watched** — `split_by: "subscribed_status"`. Subscribers are
  usually a small minority on Shorts; the unsubscribed share tells you
  whether the video reached new people.
- **Search** — marginal on Shorts (typically under ~5% of views). Search
  terms (`yt_traffic_source_detail`, `YT_SEARCH`) show intent, not reach.
- **Sharing** — `EXT_URL` detail shows where it was shared (messaging
  apps, sites).

## Long-form

- **Discovery** — browse features, suggested videos (`RELATED_VIDEO`), and
  search (`YT_SEARCH`). Use `yt_traffic_source_detail` for search terms and
  the videos that recommend you.
- **The hook** — the first ~30 seconds of the retention curve. A steep drop
  there is an intro or promise problem.
- **Retention** — averageViewDuration in minutes, plus dips in the curve;
  convert a dip's ratio to a timestamp (ratio × video length) and name it.
- **Impressions and click-through rate** — decide long-form reach and are
  Studio-only. Always ask for them.

## What the API cannot see

Impressions, impressions click-through rate, unique viewers, new vs.
returning viewers, "Viewed vs. swiped away", and anything real-time. Never
estimate these — ask for them or list them under Data gaps.

## Traps

- Data lags 48–72 hours; the last days of any range look low.
- Days are US Pacific time.
- `yt_traffic_source_detail` returns the top 25 entries at most;
  `shareOfReturnedViews` is a share of those entries, not of the source.
  Compare against `yt_traffic_sources` for the source's real total.
- `split_by: "subscribed_status"` drops subscribersGained,
  subscribersLost, and comments (the API refuses them there); the tool
  says so in `note`.
- `group_by: "month"` needs whole months (first to last day).
- `yt_audience_retention` returns nothing for a video under YouTube's
  watch-time threshold — common for very small Shorts. That is a data gap,
  not a zero.
- `yt_top_videos` ranks by views and has no publish dates; get dates from
  `yt_episode_race`, which takes at most 10 IDs per call.
- Small samples: under ~100 views, one shared link can move every ratio.
  Say so.
- Lifetime totals favour older videos; compare by age with
  `yt_episode_race`.
