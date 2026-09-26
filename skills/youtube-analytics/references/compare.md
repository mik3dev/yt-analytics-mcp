# Compare videos

Goal: which of 2–10 videos did better at the same age, and what explains
the gap.

## Steps

1. **Pick the set.** Use the IDs given, or the last N uploads from
   `yt_top_videos` (last 90 days, `resolve_titles: true`) — same format
   only; if formats mix, split into two comparisons.
2. **Race.** `yt_episode_race` with the IDs, metric `views`, `window_days`
   = the youngest video's age (max 90). Report the leaderboard at
   `comparableAtDay`, not totals.
3. **Quality per view.** `yt_video_performance` over each video's own life
   for averageViewPercentage, engagedViews, subscribersGained.
4. **Reach per video.** `yt_traffic_sources` with each `video_id` (top
   source and its share).
5. **Curves.** `yt_audience_retention` for the leader and the last place.
   Compare the first points and where each curve breaks.
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
