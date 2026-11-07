type Props = { label: string; value: number };

export function AdminMetricCard({ label, value }: Props) {
  return (
    <div className="sp-admin__metric">
      <div className="sp-admin__metric-value">{value}</div>
      <div className="sp-admin__metric-label">{label}</div>
    </div>
  );
}
