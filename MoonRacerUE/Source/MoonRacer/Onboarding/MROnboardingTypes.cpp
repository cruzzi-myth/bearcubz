#include "Onboarding/MROnboardingTypes.h"
#include "Misc/Crc.h"

namespace MROnboarding
{
	static const TCHAR* StateNames[] = { TEXT("START"), TEXT("ACCESS_CHECK"), TEXT("PASSPORT_CHECK"), TEXT("AVATAR_CHECK"), TEXT("ARRIVAL_CINEMATIC"),
		TEXT("CORE_SPAWN"), TEXT("FIRST_OBJECTIVE"), TEXT("TAVIAN_DIALOGUE"), TEXT("BARTENDER_HANDOFF"), TEXT("FIRST_MISSION"), TEXT("FREE_EXPLORE") };
	static_assert(UE_ARRAY_COUNT(StateNames) == (int32)EMROnboardingState::Count, "state name table out of sync");

	FName StateId(EMROnboardingState S) { return (S < EMROnboardingState::Count) ? FName(StateNames[(int32)S]) : NAME_None; }

	bool ParseState(FName Id, EMROnboardingState& Out)
	{
		for (int32 i = 0; i < (int32)EMROnboardingState::Count; ++i)
		{
			// FName compare is case-insensitive; state IDs are exact upper-case, so also compare the string case-sensitively.
			if (Id.ToString().Equals(StateNames[i], ESearchCase::CaseSensitive)) { Out = (EMROnboardingState)i; return true; }
		}
		return false;
	}

	const TArray<EMROnboardingState>& Spine()
	{
		static const TArray<EMROnboardingState> S = { EMROnboardingState::Start, EMROnboardingState::AccessCheck, EMROnboardingState::PassportCheck, EMROnboardingState::AvatarCheck,
			EMROnboardingState::ArrivalCinematic, EMROnboardingState::CoreSpawn, EMROnboardingState::FirstObjective, EMROnboardingState::TavianDialogue,
			EMROnboardingState::BartenderHandoff, EMROnboardingState::FirstMission, EMROnboardingState::FreeExplore };
		return S;
	}

	EMROnboardingState Successor(EMROnboardingState S)
	{
		const int32 I = (int32)S + 1;
		return I < (int32)EMROnboardingState::Count ? (EMROnboardingState)I : EMROnboardingState::FreeExplore;
	}

	EMROnboardingEvent ExitEventFor(EMROnboardingState S)
	{
		switch (S)
		{
		case EMROnboardingState::Start: return EMROnboardingEvent::SessionStarted;
		case EMROnboardingState::AccessCheck: return EMROnboardingEvent::AccessResolved;
		case EMROnboardingState::PassportCheck: return EMROnboardingEvent::PassportChecked;
		case EMROnboardingState::AvatarCheck: return EMROnboardingEvent::AvatarConfirmed;
		case EMROnboardingState::ArrivalCinematic: return EMROnboardingEvent::ArrivalFinished;
		case EMROnboardingState::CoreSpawn: return EMROnboardingEvent::CoreReady;
		case EMROnboardingState::FirstObjective: return EMROnboardingEvent::ObjectiveReached;
		case EMROnboardingState::TavianDialogue: return EMROnboardingEvent::FirstContactDone;
		case EMROnboardingState::BartenderHandoff: return EMROnboardingEvent::HandoffDone;
		case EMROnboardingState::FirstMission: return EMROnboardingEvent::MissionAccepted;
		default: return EMROnboardingEvent::SessionStarted;
		}
	}

	FName EventName(EMROnboardingEvent E)
	{
		static const TCHAR* N[] = { TEXT("SessionStarted"), TEXT("ReturningPlayer"), TEXT("AccessResolved"), TEXT("PassportChecked"), TEXT("AvatarConfirmed"), TEXT("ArrivalFinished"),
			TEXT("CoreReady"), TEXT("ObjectiveReached"), TEXT("FirstContactDone"), TEXT("HandoffDone"), TEXT("MissionAccepted") };
		return FName(N[(int32)E]);
	}
}

bool FMRProgressFlags::operator==(const FMRProgressFlags& O) const
{
	return bAccessResolved == O.bAccessResolved && bPassportChecked == O.bPassportChecked && bAvatarConfirmed == O.bAvatarConfirmed && bArrivalSeen == O.bArrivalSeen
		&& bArrivalSkippedUnavailable == O.bArrivalSkippedUnavailable && bCoreSpawned == O.bCoreSpawned && bFirstObjectiveDone == O.bFirstObjectiveDone
		&& bTavianIntroduced == O.bTavianIntroduced && bBartenderHandoff == O.bBartenderHandoff && FirstQuestStatus == O.FirstQuestStatus && bOnboardingCompleted == O.bOnboardingCompleted;
}

FMRProgressRecord FMRProgressRecord::MakeNew()
{
	FMRProgressRecord R;
	R.LocalProfileId = FGuid::NewGuid();
	R.CurrentState = MROnboarding::StateId(EMROnboardingState::Start);
	return R;
}

bool FMRProgressRecord::IsStateDone(EMROnboardingState S) const
{
	switch (S)
	{
	case EMROnboardingState::Start: return true;
	case EMROnboardingState::AccessCheck: return Flags.bAccessResolved;
	case EMROnboardingState::PassportCheck: return Flags.bPassportChecked;
	case EMROnboardingState::AvatarCheck: return Flags.bAvatarConfirmed;
	case EMROnboardingState::ArrivalCinematic: return Flags.bArrivalSeen || Flags.bArrivalSkippedUnavailable;
	case EMROnboardingState::CoreSpawn: return Flags.bCoreSpawned;
	case EMROnboardingState::FirstObjective: return Flags.bFirstObjectiveDone;
	case EMROnboardingState::TavianDialogue: return Flags.bTavianIntroduced;
	case EMROnboardingState::BartenderHandoff: return Flags.bBartenderHandoff;
	case EMROnboardingState::FirstMission: return Flags.FirstQuestStatus == EMRQuestStatus::Active || Flags.FirstQuestStatus == EMRQuestStatus::Completed; // D-6
	case EMROnboardingState::FreeExplore: return Flags.bOnboardingCompleted;
	default: return false;
	}
}

TArray<FString> FMRProgressRecord::Validate() const
{
	TArray<FString> P;
	EMROnboardingState Cur;
	if (!MROnboarding::ParseState(CurrentState, Cur)) { P.Add(FString::Printf(TEXT("unknown current state '%s'"), *CurrentState.ToString())); return P; }
	if (!LocalProfileId.IsValid()) P.Add(TEXT("missing local profile id"));
	if (!OpaqueSubjectId.IsEmpty()) P.Add(TEXT("OpaqueSubjectId must be empty in v1 (no server identity)"));
	if (IdentityMode != EMRIdentityMode::OfflineGuest) P.Add(TEXT("only OfflineGuest identity mode is supported in v1"));

	// Ordering: a state may be marked done only if every earlier state is done.
	bool bGapSeen = false;
	for (EMROnboardingState S : MROnboarding::Spine())
	{
		if (S == EMROnboardingState::Start) continue;
		const bool bDone = IsStateDone(S);
		if (bDone && bGapSeen) P.Add(FString::Printf(TEXT("%s is done but an earlier state is not"), *MROnboarding::StateId(S).ToString()));
		if (!bDone) bGapSeen = true;
	}
	// The current state can never be beyond the first incomplete state.
	for (EMROnboardingState S : MROnboarding::Spine())
	{
		if ((int32)S >= (int32)Cur) break;
		if (!IsStateDone(S)) { P.Add(FString::Printf(TEXT("current state %s but %s is not done"), *CurrentState.ToString(), *MROnboarding::StateId(S).ToString())); break; }
	}
	if (Flags.bArrivalSeen && Flags.bArrivalSkippedUnavailable) P.Add(TEXT("arrival cannot be both seen and skipped-unavailable"));
	if (Flags.bAvatarConfirmed && !AvatarRef.IsSet()) P.Add(TEXT("avatar confirmed but no avatar reference"));
	if (Flags.bCoreSpawned && !LastSafeSpawn.IsSet()) P.Add(TEXT("core spawned but no safe spawn recorded"));
	if (!Flags.bBartenderHandoff && Flags.FirstQuestStatus != EMRQuestStatus::NotOffered) P.Add(TEXT("quest status set before bartender handoff"));
	if (Flags.bOnboardingCompleted)
	{
		if (Cur != EMROnboardingState::FreeExplore) P.Add(TEXT("completed but current state is not FREE_EXPLORE"));
		if (Flags.FirstQuestStatus != EMRQuestStatus::Active && Flags.FirstQuestStatus != EMRQuestStatus::Completed) P.Add(TEXT("completed but first mission was never accepted"));
	}
	if (Cur == EMROnboardingState::FreeExplore && !Flags.bOnboardingCompleted) P.Add(TEXT("FREE_EXPLORE without completion flag"));
	return P;
}

FString FMRProgressRecord::ToCanonicalString() const
{
	return FString::Printf(TEXT("%s|%d|%s|%s|%d%d%d%d%d%d%d%d%d|%d|%d|%s|%s|%s|%d|%s|%s|%s"),
		*LocalProfileId.ToString(), (int32)IdentityMode, *OpaqueSubjectId, *CurrentState.ToString(),
		Flags.bAccessResolved, Flags.bPassportChecked, Flags.bAvatarConfirmed, Flags.bArrivalSeen, Flags.bArrivalSkippedUnavailable, Flags.bCoreSpawned,
		Flags.bFirstObjectiveDone, Flags.bTavianIntroduced, Flags.bBartenderHandoff, (int32)Flags.FirstQuestStatus, Flags.bOnboardingCompleted,
		*LastSafeSpawn.MapId.ToString(), *LastSafeSpawn.SpawnPointId.ToString(), *AvatarRef.AvatarId.ToString(), AvatarRef.Revision,
		*Content.CoreManifestVersion.ToString(), *Content.QuestRegistryVersion.ToString(), *Content.DialogueVersion.ToString());
}

bool FMRProgressRecord::operator==(const FMRProgressRecord& O) const
{
	return ToCanonicalString() == O.ToCanonicalString();
}

namespace MROnboarding
{
	FMRResumePlan ComputeResumePlan(const FMRProgressRecord& Record, const FMRResumeContext& Ctx)
	{
		FMRResumePlan Plan;
		Plan.AdjustedFlags = Record.Flags;

		if (Record.Flags.bOnboardingCompleted)
		{
			Plan.bReturningPlayer = true;
			Plan.Target = EMROnboardingState::FreeExplore;
			return Plan;
		}

		// First not-done state on the spine (flags are NOT cleared: later progress is kept).
		EMROnboardingState Target = EMROnboardingState::FreeExplore;
		for (EMROnboardingState S : MROnboarding::Spine())
		{
			if (S == EMROnboardingState::Start) continue;
			if (!Record.IsStateDone(S)) { Target = S; break; }
		}

		// Re-verify the avatar instead of trusting the flag.
		if (Record.Flags.bAvatarConfirmed && !Ctx.bAvatarValid)
		{
			Plan.Notes.Add(TEXT("avatar flag set but no valid avatar exists; revisiting AVATAR_CHECK (later progress kept)"));
			Plan.bAvatarRevisit = true;
		}
		else if (Record.Flags.bAvatarConfirmed && Record.AvatarRef.IsSet() && Ctx.CurrentAvatarId.IsValid() && Record.AvatarRef.AvatarId != Ctx.CurrentAvatarId)
		{
			Plan.Notes.Add(TEXT("avatar reference differs from the current avatar save; AVATAR_CHECK will refresh it"));
			Plan.bAvatarRevisit = true;
		}
		Plan.Target = Target;
		// Anything after CORE_SPAWN needs the level loaded and the avatar spawned first.
		Plan.bNeedsRespawnFirst = (int32)Target > (int32)EMROnboardingState::CoreSpawn;
		return Plan;
	}
}
