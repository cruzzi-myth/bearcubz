interface SpeciesConfirmationModalProps {
  speciesName: string;
  busy: boolean;
  errors: string[] | null;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Avatar Phase 2C — the one moment that permanently commits species
 * identity. Deliberately separate from ordinary Next/Continue: opening
 * this modal never itself writes anything, and clicking Confirm only
 * advances the UI once confirmAvatarSpecies() actually succeeds (see
 * AvatarCreationPage's handleConfirmSpecies) — a failed RPC call keeps
 * the player here with a visible error, never a silently "locked" UI.
 */
export function SpeciesConfirmationModal({ speciesName, busy, errors, onCancel, onConfirm }: SpeciesConfirmationModalProps) {
  return (
    <div className="mr-species-confirm-backdrop" role="presentation">
      <div className="mr-species-confirm" role="alertdialog" aria-modal="true" aria-labelledby="species-confirm-title">
        <p id="species-confirm-title" className="mr-species-confirm__title">
          CONFIRM SPECIES
        </p>
        <p className="mr-species-confirm__body">
          Your species is your permanent biological identity within the Moon Racer Universe. Once confirmed, you will not
          be able to choose another species through normal gameplay.
        </p>
        <p className="mr-species-confirm__body">
          You will still be able to change eligible appearance options such as clothing, hairstyle, accessories, and
          other cosmetics.
        </p>
        <p className="mr-species-confirm__species">
          Species selected: <strong>{speciesName.toUpperCase()}</strong>
        </p>
        {errors && errors.length > 0 && (
          <ul className="mr-avatar-errors" role="alert">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        <div className="mr-species-confirm__actions">
          <button
            type="button"
            className="network-btn mr-avatar-nav__back"
            onClick={onCancel}
            disabled={busy}
          >
            Go Back
          </button>
          <button type="button" className="network-btn" onClick={onConfirm} disabled={busy}>
            {busy ? 'Confirming…' : `Confirm ${speciesName}`}
          </button>
        </div>
      </div>
    </div>
  );
}
