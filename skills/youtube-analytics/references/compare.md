# Compare videos

Goal: which of 2–10 videos did better at the same age, and what explains
the gap.

## Steps

1. **Pick the set.** Use the IDs given. For "my last N uploads": take up to
   50 candidate IDs from `yt_top_videos` (last 90 days, `content_type` of
   one format, `max_results: 50`, `resolve_titles: true`), get their publish
   dates with `yt_episode_race` in batches of at most 10 IDs, and keep the N
   most recent (N ≤ 10). One format per comparison; if formats mix, make two.
2. **Race.** `yt_episode_race` with the IDs, metric `views`, `window_days`
   = the youngest video's age (max 90). Report the leaderboard at
   `comparableAtDay`, not totals.
3. **Quality per view.** `yt_video_performance` for all IDs in one call,
   from the earliest publish date to three days ago (the tool takes one
   window for all IDs): averageViewPercentage, engagedViews,
   subscribersGained.
4. **Reach per video.** `yt_traffic_sources` with each `video_id` (top
   source and its share).
5. **Curves.** `yt_audience_retention` with `sample_every: 1` for the
   leader and the last place. Compare the first points and where each curve
   breaks. A video with no retention rows goes under Data gaps.
6. **Studio-only numbers.** Ask once for the per-video "Viewed vs. swiped
   away" (Shorts) or impressions CTR (long-form).
7. **Write** the output template. Title:
   `Comparison: <n> videos at day <d> (<format>)`.

## What to look for

- Is the gap reach (feed/browse views differ) or retention (similar reach,
  different watch-through)?
- What the leader does in its first seconds that the others do not — name
  it from the curve, and from the titles only as a hypothesis.
- Rank at the shared age can disagree with lifetime totals; when it does,
  that disagreement is the finding.
