import type { VoteResult } from '../lib/voteApi';
import { getTrackById } from '../data/tracks';

type Props = {
  results: VoteResult[];
  highlightTrackId: number;
  animate?: boolean;
};

export function Leaderboard({ results, highlightTrackId, animate = false }: Props) {
  const totalVotes = results.reduce((sum, row) => sum + row.votes, 0);

  return (
    <ol className={`leaderboard${animate ? ' leaderboard--animate' : ''}`} aria-label="Live vote standings">
      {results.map((row, index) => {
        const track = getTrackById(row.track_id);
        const isMine = row.track_id === highlightTrackId;
        return (
          <li
            key={row.track_id}
            className={`leaderboard__row${isMine ? ' leaderboard__row--mine' : ''}`}
            style={{ '--row-delay': `${index * 35}ms` } as React.CSSProperties}
          >
            <span className="leaderboard__rank">{index + 1}</span>
            <span className="leaderboard__title">{track?.title ?? `Track ${row.track_id}`}</span>
            <span className="leaderboard__bar-track">
              <span className="leaderboard__bar" style={{ width: `${row.percentage}%` }} />
            </span>
            <span className="leaderboard__pct">{row.percentage}%</span>
            <span className="leaderboard__votes">{row.votes} vote{row.votes === 1 ? '' : 's'}</span>
            {isMine && <span className="leaderboard__marker">YOUR VOTE</span>}
          </li>
        );
      })}
      <li className="leaderboard__total" aria-hidden="true">{totalVotes} total votes today</li>
    </ol>
  );
}
