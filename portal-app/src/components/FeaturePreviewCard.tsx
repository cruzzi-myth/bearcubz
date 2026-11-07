import './feature-preview-card.css';

type Props = {
  icon: string;
  label: string;
  subtitle: string;
};

/**
 * One of the four entrance feature previews (Listen / Proposal /
 * Visuals / Respond). These are previews, not links into a private
 * workspace — there's nothing to authorize yet, so they're
 * deliberately inert rather than navigating anywhere.
 */
export function FeaturePreviewCard({ icon, label, subtitle }: Props) {
  return (
    <div className="sp-feature" role="group" aria-label={`${label} — ${subtitle} — preview only, requires authorized access`}>
      <span className="sp-feature__lock" aria-hidden="true">
        ◈
      </span>
      <span className="sp-feature__icon" aria-hidden="true">
        {icon}
      </span>
      <span className="sp-feature__label">{label}</span>
      <span className="sp-feature__subtitle">{subtitle}</span>
    </div>
  );
}
