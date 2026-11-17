#include "Onboarding/MRCheckpointV2.h"
#include "Misc/Crc.h"
#include "UObject/Package.h"
#include "UObject/UObjectGlobals.h"

namespace
{
	const TCHAR* V2Names[] = { TEXT("START"), TEXT("ACCESS_CHECK"), TEXT("IDENTITY_CHECK"), TEXT("AVATAR_CHECK"), TEXT("STATION_ENTRY"), TEXT("TAVERN_APPROACH"), TEXT("TAVIAN_ENCOUNTER"),
		TEXT("DEPARTURE_APPROACH"), TEXT("PASSPORT_SCAN"), TEXT("TRANSIT_TO_CORE"), TEXT("CORE_ARRIVAL"), TEXT("FREE_EXPLORE") };
	static_assert(UE_ARRAY_COUNT(V2Names) == (int32)EMROnboardingStateV2::Count, "v2 state name table out of sync");

	FString B(bool V) { return V ? TEXT("1") : TEXT("0"); }
}

namespace MROnboardingV2
{
	FName StateId(EMROnboardingStateV2 S) { return S < EMROnboardingStateV2::Count ? FName(V2Names[(int32)S]) : NAME_None; }
	bool ParseState(FName Id, EMROnboardingStateV2& Out)
	{
		for (int32 I = 0; I < (int32)EMROnboardingStateV2::Count; ++I) if (Id.ToString().Equals(V2Names[I], ESearchCase::CaseSensitive)) { Out = (EMROnboardingStateV2)I; return true; }
		return false;
	}
	const TArray<EMROnboardingStateV2>& Spine()
	{
		static TArray<EMROnboardingStateV2> S; if (S.Num() == 0) for (int32 I = 0; I < (int32)EMROnboardingStateV2::Count; ++I) S.Add((EMROnboardingStateV2)I);
		return S;
	}
	EMROnboardingStateV2 FirstIncompleteState(const FMRCheckpointV2& R)
	{
		if (R.bOnboardingCompleted) return EMROnboardingStateV2::FreeExplore;
		for (EMROnboardingStateV2 S : Spine()) { if (S == EMROnboardingStateV2::Start) continue; if (!R.IsStateDone(S)) return S; }
		return EMROnboardingStateV2::FreeExplore;
	}
	int32 ComputeChecksum(int32 Generation, const FMRCheckpointV2& R) { return (int32)FCrc::StrCrc32(*(FString::FromInt(Generation) + TEXT("#v2#") + R.ToCanonicalString())); }
}

// ---------------------------------------------------------------------------------------------------------------
FMRCheckpointV2 FMRCheckpointV2::MakeNew()
{
	FMRCheckpointV2 R; R.LocalProfileId = FGuid::NewGuid(); R.CurrentState = MROnboardingV2::StateId(EMROnboardingStateV2::Start);
	return R;
}

bool FMRCheckpointV2::IsStateDone(EMROnboardingStateV2 S) const
{
	switch (S)
	{
	case EMROnboardingStateV2::Start: return true;
	case EMROnboardingStateV2::AccessCheck: return bAccessResolved;
	case EMROnboardingStateV2::IdentityCheck: return bIdentityResolved;
	case EMROnboardingStateV2::AvatarCheck: return bAvatarConfirmed;
	case EMROnboardingStateV2::StationEntry: return bStationEntered;
	case EMROnboardingStateV2::TavernApproach: return bTavernReached;
	case EMROnboardingStateV2::TavianEncounter: return bTavianEncounterDone;
	case EMROnboardingStateV2::DepartureApproach: return bDepartureReached;
	case EMROnboardingStateV2::PassportScan: return PassportScanResult != EMRPassportScanResult::NotScanned;
	case EMROnboardingStateV2::TransitToCore: return bTransitSeen || bTransitSkippedUnavailable;
	case EMROnboardingStateV2::CoreArrival: return bCoreArrived;
	case EMROnboardingStateV2::FreeExplore: return bOnboardingCompleted;
	default: return false;
	}
}

const FMRLocationSafeSpawn* FMRCheckpointV2::FindSafeSpawn(FName LocationId) const
{
	for (const FMRLocationSafeSpawn& S : SafeSpawns) if (S.LocationId == LocationId) return &S;
	return nullptr;
}

TArray<FString> FMRCheckpointV2::Validate() const
{
	TArray<FString> P;
	EMROnboardingStateV2 Cur;
	if (!MROnboardingV2::ParseState(CurrentState, Cur)) { P.Add(FString::Printf(TEXT("unknown current state '%s'"), *CurrentState.ToString())); return P; }
	if (!LocalProfileId.IsValid()) P.Add(TEXT("missing local profile id"));
	if (!OpaqueSubjectId.IsEmpty()) P.Add(TEXT("OpaqueSubjectId must be empty (no server identity)"));
	if (IdentityMode != EMRIdentityMode::OfflineGuest) P.Add(TEXT("only OfflineGuest identity mode is supported"));
	if (bAvatarConfirmed && !AvatarRef.IsSet()) P.Add(TEXT("avatar confirmed but no avatar reference"));

	const bool bLegacy = LegacyOrigin != EMRLegacyOrigin::None;
	if (bLegacy && !LegacyV1.bPresent) P.Add(TEXT("legacy origin without the v1 snapshot"));
	if (!bLegacy && LegacyV1.bPresent) P.Add(TEXT("v1 snapshot present without a legacy origin"));
	if (bLegacyCompleted != (LegacyOrigin == EMRLegacyOrigin::V1Completed)) P.Add(TEXT("bLegacyCompleted must be set exactly when LegacyOrigin is V1Completed"));

	// the chain: a step may be done only if the previous step is done. Legacy-mapped records may carry the tavern flags AHEAD of station entry
	// (they resume at STATION_ENTRY) and may lack a re-verified avatar; nothing else may run ahead.
	const bool bCarriedAhead = LegacyOrigin == EMRLegacyOrigin::V1Mapped;
	auto Need = [&](bool bDone, bool bPrereq, const TCHAR* What, const TCHAR* Prereq) { if (bDone && !bPrereq) P.Add(FString::Printf(TEXT("%s is set but %s is not"), What, Prereq)); };
	Need(bIdentityResolved, bAccessResolved, TEXT("identity"), TEXT("access"));
	if (!bLegacy) Need(bAvatarConfirmed, bIdentityResolved, TEXT("avatar"), TEXT("identity"));
	if (!bLegacy) Need(bStationEntered, bAvatarConfirmed, TEXT("station entry"), TEXT("avatar"));
	if (!bCarriedAhead) Need(bTavernReached, bStationEntered, TEXT("tavern reached"), TEXT("station entry"));
	Need(bTavianEncounterStarted, bTavernReached, TEXT("tavian encounter started"), TEXT("tavern reached"));
	Need(bTavianEncounterDone, bTavianEncounterStarted, TEXT("tavian encounter done"), TEXT("tavian encounter started"));
	if (!bLegacy || bStationEntered) Need(bDepartureReached, bTavianEncounterDone, TEXT("departure reached"), TEXT("tavian encounter done"));
	else if (bDepartureReached) P.Add(TEXT("departure reached without station entry (legacy records may not run ahead past the tavern flags)"));

	const bool bScanned = PassportScanResult != EMRPassportScanResult::NotScanned;
	const bool bGrandScan = PassportScanResult == EMRPassportScanResult::LegacyGrandfathered;
	if (bGrandScan != (TravelAuthorization == EMRTravelAuthorization::LegacyGrandfathered)) P.Add(TEXT("a grandfathered scan and a grandfathered travel authorization go together"));
	if (bGrandScan && LegacyOrigin != EMRLegacyOrigin::V1Completed) P.Add(TEXT("grandfathered scan/authorization is only valid for a legacy-completed player"));
	if (!bGrandScan)
	{
		Need(bScanned, bDepartureReached, TEXT("passport scan"), TEXT("departure reached"));
		if (TravelAuthorization == EMRTravelAuthorization::Authorized && !bScanned) P.Add(TEXT("travel authorized without a recorded scan"));
		if (bScanned && TravelAuthorization != EMRTravelAuthorization::Authorized && !bTransitSeen && !bTransitSkippedUnavailable && !bCoreArrived) { /* scanned, authorization not yet recorded: allowed (same edge) */ }
		Need(bTransitSeen || bTransitSkippedUnavailable, TravelAuthorization == EMRTravelAuthorization::Authorized, TEXT("transit"), TEXT("travel authorization"));
		Need(bCoreArrived, bTransitSeen || bTransitSkippedUnavailable, TEXT("core arrival"), TEXT("a transit outcome"));
	}
	else
	{
		if (bStationEntered || bTavernReached || bTavianEncounterDone || bDepartureReached || bTransitSeen || bTransitSkippedUnavailable || bCoreArrived) P.Add(TEXT("a legacy-completed record must not claim station/transit/arrival steps"));
	}
	if (bTransitSeen && bTransitSkippedUnavailable) P.Add(TEXT("transit cannot be both seen and skipped-unavailable"));

	TSet<FName> Seen;
	for (const FMRLocationSafeSpawn& S : SafeSpawns)
	{
		if (S.LocationId.IsNone() || S.SpawnPointId.IsNone()) P.Add(TEXT("a safe spawn needs a location and a spawn id"));
		else if (Seen.Contains(S.LocationId)) P.Add(TEXT("duplicate safe spawn for a location")); Seen.Add(S.LocationId);
	}
	if (bOnboardingCompleted)
	{
		if (bLegacyCompleted) { /* explicit legacy completion */ }
		else
		{
			if (!(bAccessResolved && bIdentityResolved && bAvatarConfirmed && bScanned && TravelAuthorization == EMRTravelAuthorization::Authorized && (bTransitSeen || bTransitSkippedUnavailable) && bCoreArrived)) P.Add(TEXT("completed without the full station->scan->transit->arrival chain (and not legacy-completed)"));
			if (SafeSpawns.Num() == 0) P.Add(TEXT("completed without any safe spawn"));
		}
		if (Cur != EMROnboardingStateV2::FreeExplore) P.Add(TEXT("completed but current state is not FREE_EXPLORE"));
	}
	if (Cur == EMROnboardingStateV2::FreeExplore && !bOnboardingCompleted) P.Add(TEXT("FREE_EXPLORE without the completion flag"));
	// the resume pointer can never be beyond the first incomplete state
	if (!bOnboardingCompleted) { const EMROnboardingStateV2 First = MROnboardingV2::FirstIncompleteState(*this); if ((int32)Cur > (int32)First) P.Add(FString::Printf(TEXT("current state %s is beyond the first incomplete state %s"), *CurrentState.ToString(), *MROnboardingV2::StateId(First).ToString())); }
	return P;
}

FString FMRCheckpointV2::ToCanonicalString() const
{
	TArray<FString> Sp; for (const FMRLocationSafeSpawn& S : SafeSpawns) Sp.Add(S.LocationId.ToString() + TEXT(">") + S.SpawnPointId.ToString()); Sp.Sort();
	const FMRProgressFlags& F = LegacyV1.Flags;
	FString O;
	auto Add = [&O](const FString& V) { O += V; O += TEXT("|"); };
	Add(LocalProfileId.ToString()); Add(FString::FromInt((int32)IdentityMode)); Add(OpaqueSubjectId);
	Add(B(bAccessResolved) + B(bIdentityResolved) + B(bAvatarConfirmed)); Add(AvatarRef.AvatarId.ToString() + TEXT(":") + FString::FromInt(AvatarRef.Revision));
	Add(B(bStationEntered) + B(bTavernReached) + B(bTavianEncounterStarted) + B(bTavianEncounterDone) + B(bDepartureReached));
	Add(FString::FromInt((int32)PassportScanResult) + TEXT("/") + FString::FromInt((int32)TravelAuthorization));
	Add(B(bTransitSeen) + B(bTransitSkippedUnavailable) + B(bCoreArrived)); Add(FString::Join(Sp, TEXT(",")));
	Add(B(bOnboardingCompleted) + B(bLegacyCompleted) + FString::FromInt((int32)LegacyOrigin));
	Add(B(LegacyV1.bPresent) + LegacyV1.State.ToString() + LegacyV1.LocalProfileId.ToString());
	Add(B(F.bAccessResolved) + B(F.bPassportChecked) + B(F.bAvatarConfirmed) + B(F.bArrivalSeen) + B(F.bArrivalSkippedUnavailable) + B(F.bCoreSpawned) + B(F.bFirstObjectiveDone) + B(F.bTavianIntroduced) + B(F.bBartenderHandoff) + B(F.bOnboardingCompleted) + FString::FromInt((int32)F.FirstQuestStatus));
	Add(LegacyV1.LastSafeSpawn.MapId.ToString() + TEXT(">") + LegacyV1.LastSafeSpawn.SpawnPointId.ToString()); Add(LegacyV1.AvatarRef.AvatarId.ToString() + TEXT(":") + FString::FromInt(LegacyV1.AvatarRef.Revision));
	Add(LegacyV1.Content.CoreManifestVersion.ToString() + TEXT("/") + LegacyV1.Content.QuestRegistryVersion.ToString() + TEXT("/") + LegacyV1.Content.DialogueVersion.ToString());
	Add(CurrentState.ToString()); Add(Content.CoreManifestVersion.ToString() + TEXT("/") + Content.QuestRegistryVersion.ToString() + TEXT("/") + Content.DialogueVersion.ToString());
	return O;
}

FMRNarrativeEvidence FMRNarrativeEvidence::From(const FMRNarrativeState& S)
{
	FMRNarrativeEvidence E; E.bAvailable = true; E.CompletedDialogues = S.CompletedDialogues; E.FiredEffects = S.FiredEffects; E.CompletedObjectives = S.CompletedObjectives; E.Facts = S.Facts; E.Missions = S.Missions;
	return E;
}

FString FMRConsistencyReport::ToString() const
{
	FString S; for (const FMRInconsistency& I : Items) S += FString::Printf(TEXT("%s %s: %s [%s]\n"), I.Severity == EMRConsistencySeverity::Conflict ? TEXT("CONFLICT") : I.Severity == EMRConsistencySeverity::Warning ? TEXT("WARN") : TEXT("INFO"), *I.Code.ToString(), *I.Message, *FString::Join(I.Evidence, TEXT("; ")));
	return S;
}

// ---------------------------------------------------------------------------------------------------------------
namespace MROnboardingV2
{
	FMRMigrationResult MigrateV1ToV2(const FMRProgressRecord& V1, const FMRMigrationContext& Ctx)
	{
		FMRMigrationResult R; FMRCheckpointV2 O;
		const FMRProgressFlags& F = V1.Flags;
		// a deterministic profile id even for a damaged record (idempotence): derived from the v1 canonical text, never random
		O.LocalProfileId = V1.LocalProfileId.IsValid() ? V1.LocalProfileId : FGuid(FCrc::StrCrc32(*V1.ToCanonicalString()), 0, 0, 1);
		O.IdentityMode = EMRIdentityMode::OfflineGuest; O.OpaqueSubjectId.Empty(); O.Content = V1.Content;
		O.LegacyV1.bPresent = true; O.LegacyV1.State = V1.CurrentState; O.LegacyV1.Flags = F; O.LegacyV1.LastSafeSpawn = V1.LastSafeSpawn; O.LegacyV1.AvatarRef = V1.AvatarRef; O.LegacyV1.Content = V1.Content; O.LegacyV1.LocalProfileId = V1.LocalProfileId;

		EMROnboardingState Cur;
		const bool bKnownState = MROnboarding::ParseState(V1.CurrentState, Cur);
		const TArray<FString> Problems = bKnownState ? V1.Validate() : TArray<FString>{ FString::Printf(TEXT("unknown v1 state '%s'"), *V1.CurrentState.ToString()) };
		const bool bBadIdentity = V1.IdentityMode != EMRIdentityMode::OfflineGuest || !V1.OpaqueSubjectId.IsEmpty();

		// ---- launch identity + avatar: the only facts carried for certain
		const bool bAccess = F.bAccessResolved;
		const bool bIdent = F.bPassportChecked && bAccess;
		const bool bAvatarContradicted = Ctx.Avatar.bChecked && !Ctx.Avatar.bValid;
		const bool bAvatar = F.bAvatarConfirmed && V1.AvatarRef.IsSet() && bIdent && !bAvatarContradicted;
		O.bAccessResolved = bAccess; O.bIdentityResolved = bIdent; O.bAvatarConfirmed = bAvatar; if (bAvatar) O.AvatarRef = V1.AvatarRef;
		if (F.bAvatarConfirmed && bAvatarContradicted) R.Notes.Add(TEXT("the v1 checkpoint says the avatar was confirmed but the avatar save is missing/invalid: avatar NOT carried (AVATAR_CHECK will run); other progress is kept"));
		else if (bAvatar && !Ctx.Avatar.bChecked) R.Notes.Add(TEXT("avatar carried from the v1 record; the avatar save was not inspected at migration (AVATAR_CHECK re-verifies on resume)"));

		auto Finish = [&](EMRMigrationCase C, EMRLegacyOrigin Origin)
		{
			R.Case = C; O.LegacyOrigin = Origin; O.bLegacyCompleted = Origin == EMRLegacyOrigin::V1Completed;
			if (O.bOnboardingCompleted) O.CurrentState = StateId(EMROnboardingStateV2::FreeExplore); else O.CurrentState = StateId(FirstIncompleteState(O));
			R.Record = O; R.bOk = true; return R;
		};

		// ---- F: anything that cannot be trusted -> strictly EARLIER than the truth
		if (!bKnownState || Problems.Num() > 0 || bBadIdentity)
		{
			R.Notes.Add(FString::Printf(TEXT("SAFE FALLBACK: %s; only verified identity/avatar facts are kept, the full v1 record is preserved in LegacyV1, no station/scan/transit/arrival/completion is claimed"), Problems.Num() ? *Problems[0] : TEXT("unsupported identity data")));
			return Finish(EMRMigrationCase::F_Fallback, EMRLegacyOrigin::V1Fallback);
		}

		// ---- E: legitimate completed player -> explicit legacy marker, never a recorded scan/arrival
		if (F.bOnboardingCompleted)
		{
			O.bOnboardingCompleted = true;
			O.PassportScanResult = EMRPassportScanResult::LegacyGrandfathered; O.TravelAuthorization = EMRTravelAuthorization::LegacyGrandfathered;
			if (!Ctx.Map.ApprovedCoreLocationId.IsNone() && V1.LastSafeSpawn.IsSet() && V1.LastSafeSpawn.MapId == Ctx.Map.ApprovedCoreLocationId)
			{ FMRLocationSafeSpawn S; S.LocationId = V1.LastSafeSpawn.MapId; S.SpawnPointId = V1.LastSafeSpawn.SpawnPointId; O.SafeSpawns.Add(S); R.Notes.Add(TEXT("the v1 Core safe spawn matches the approved Core location id and is carried")); }
			else R.Notes.Add(TEXT("no approved Core location id matches the v1 safe spawn: no safe spawn is assigned (it stays in LegacyV1 only)"));
			R.Notes.Add(TEXT("completed under the legacy order: grandfathered (explicit marker); no station, scan, transit or arrival is claimed; mission status and the one-time ledger are untouched"));
			if (bAvatarContradicted) R.Notes.Add(TEXT("completed player whose avatar save is missing/invalid: completion preserved, avatar revisit reported"));
			return Finish(EMRMigrationCase::E_CompletedGrandfathered, EMRLegacyOrigin::V1Completed);
		}

		// ---- in progress
		const bool bDeep = F.bFirstObjectiveDone || F.bTavianIntroduced || F.bBartenderHandoff || F.FirstQuestStatus != EMRQuestStatus::NotOffered;
		if (bDeep)
		{
			bool bEvidence = false;
			if (F.bTavianIntroduced && Ctx.Narrative.bAvailable) for (FName Id : Ctx.Map.TavianDialogueIds) if (Ctx.Narrative.CompletedDialogues.Contains(Id)) bEvidence = true;
			if (bEvidence)
			{
				O.bTavernReached = true; O.bTavianEncounterStarted = true; O.bTavianEncounterDone = true;
				R.Notes.Add(TEXT("the approved Tavian conversation is recorded as completed in the narrative save: encounter progress carried; the station itself must still be entered; nothing is replayed; one-time effects and mission statuses are untouched"));
				return Finish(EMRMigrationCase::D1_TavianEvidence, EMRLegacyOrigin::V1Mapped);
			}
			R.Notes.Add(!F.bTavianIntroduced ? TEXT("the v1 Tavian conversation was in progress/not completed (interrupted): not carried; it restarts from the beginning (D-7) and any one-time effect already applied is NOT repeated")
				: !Ctx.Narrative.bAvailable ? TEXT("v1 Tavian flags are set but the narrative save is unavailable: not carried (no evidence)")
				: Ctx.Map.TavianDialogueIds.Num() == 0 ? TEXT("v1 Tavian flags are set but no approved Tavian dialogue id exists yet: not carried (no evidence can be matched)")
				: TEXT("v1 Tavian flags are set but the narrative save does not show the approved conversation completed: not carried"));
			R.Notes.Add(TEXT("any mission status in the narrative save is preserved as-is and is never re-offered, replayed or completed by migration"));
			return Finish(EMRMigrationCase::D2_TavianNoEvidence, EMRLegacyOrigin::V1Mapped);
		}
		if (F.bCoreSpawned)
		{
			R.Notes.Add(TEXT("the player had reached the Core under the legacy order but did no station content: resume at the station; the v1 Core safe spawn stays in LegacyV1 only"));
			return Finish(EMRMigrationCase::C_CoreSpawned, EMRLegacyOrigin::V1Mapped);
		}
		if (bAvatar)
		{
			if (F.bArrivalSeen || F.bArrivalSkippedUnavailable) R.Notes.Add(TEXT("the v1 arrival-cinematic outcome is kept in LegacyV1 only; it is NOT treated as the new transit being seen"));
			return Finish(EMRMigrationCase::B_AvatarOnly, EMRLegacyOrigin::V1Mapped);
		}
		return Finish(EMRMigrationCase::A_BeforeAvatar, EMRLegacyOrigin::V1Mapped);
	}

	FMRMigrationResult MigrateSaveObject(UMRProgressSaveGame* Save, const FMRMigrationContext& Ctx)
	{
		FMRMigrationResult R;
		if (!Save) { R.Rejected = TEXT("no save object"); return R; }
		if (Save->SaveVersion > CheckpointVersion) { R.Rejected = FString::Printf(TEXT("unsupported newer save version %d (this build reads up to %d); not loaded, not modified"), Save->SaveVersion, CheckpointVersion); return R; }
		if (Save->SaveVersion == CheckpointVersion)
		{
			if (UMRProgressSaveGameV2* V2 = Cast<UMRProgressSaveGameV2>(Save)) { R.bOk = true; R.Record = V2->RecordV2; R.Notes.Add(TEXT("already v2: passed through unchanged")); return R; }
			R.Rejected = TEXT("a version-2 save without the v2 payload"); return R;
		}
		UMRProgressSaveGame* Copy = DuplicateObject<UMRProgressSaveGame>(Save, GetTransientPackage());   // the source object is never mutated
		TArray<FString> Notes; bool bMig = false;
		if (!FMRProgressStore::Migrate(Copy, Notes, bMig)) { R.Rejected = Notes.Num() ? Notes[0] : TEXT("v0 migration failed"); return R; }
		R = MigrateV1ToV2(Copy->Record, Ctx); R.Notes.Insert(Notes, 0);
		return R;
	}

	FMRConsistencyReport ReconcileSaves(const FMRCheckpointV2& Onb, const FMRSaveEvidence& Ev)
	{
		FMRConsistencyReport Rep;
		auto Add = [&](const TCHAR* Code, EMRConsistencySeverity Sev, const FString& Msg, TArray<FString> Evidence = {}) { FMRInconsistency I; I.Code = FName(Code); I.Severity = Sev; I.Message = Msg; I.Evidence = MoveTemp(Evidence); Rep.Items.Add(I); };
		auto Join = [](const TSet<FName>& S) { TArray<FString> A; for (FName N : S) A.Add(N.ToString()); A.Sort(); return FString::Join(A, TEXT(",")); };

		for (const FString& P : Onb.Validate()) Add(TEXT("V2_STRUCTURAL"), EMRConsistencySeverity::Conflict, TEXT("the onboarding checkpoint is internally inconsistent; it is preserved as-is"), { P });

		// ---- avatar save vs onboarding
		const FMRAvatarEvidence& A = Ev.Avatar;
		if (A.bChecked)
		{
			if (Onb.bAvatarConfirmed && !A.bValid) Add(TEXT("AVATAR_MISSING"), EMRConsistencySeverity::Warning, TEXT("onboarding records a confirmed avatar but the avatar save is missing/invalid: avatar revisit is required; all other progress is preserved"), { FString::Printf(TEXT("malformedPreserved=%d newerRejected=%d"), A.bMalformedPreserved, A.bNewerRejected) });
			if (Onb.bOnboardingCompleted && !A.bValid) Add(TEXT("COMPLETED_WITHOUT_AVATAR"), EMRConsistencySeverity::Warning, TEXT("onboarding is completed but the avatar save is missing/invalid: completion is preserved, the avatar revisit is reported"));
			if (Onb.bAvatarConfirmed && A.bValid && A.AvatarId.IsValid() && Onb.AvatarRef.AvatarId != A.AvatarId) Add(TEXT("AVATAR_REF_MISMATCH"), EMRConsistencySeverity::Info, TEXT("the avatar reference in onboarding differs from the current avatar save: the reference is refreshed on the next confirmation"), { Onb.AvatarRef.AvatarId.ToString(), A.AvatarId.ToString() });
			else if (Onb.bAvatarConfirmed && A.bValid && Onb.AvatarRef.AvatarId == A.AvatarId && Onb.AvatarRef.Revision != A.Revision) Add(TEXT("AVATAR_REVISION_DIFFERS"), EMRConsistencySeverity::Info, TEXT("the avatar was edited after onboarding recorded its revision"), { FString::FromInt(Onb.AvatarRef.Revision), FString::FromInt(A.Revision) });
		}
		// ---- narrative save / ledger vs onboarding
		const FMRNarrativeEvidence& N = Ev.Narrative; const FMRMigrationMap& M = Ev.Map;
		if (!N.bAvailable)
		{
			if (Onb.bTavianEncounterDone) Add(TEXT("NARRATIVE_UNAVAILABLE"), EMRConsistencySeverity::Warning, TEXT("onboarding records the Tavian encounter as done but the narrative save is unavailable: nothing is replayed or assumed; gates that need mission status stay unknown"));
		}
		else
		{
			bool bDialogueDone = false; for (FName Id : M.TavianDialogueIds) if (N.CompletedDialogues.Contains(Id)) bDialogueDone = true;
			if (M.TavianDialogueIds.Num() == 0) { if (Onb.bTavianEncounterDone) Add(TEXT("EVIDENCE_IDS_UNAPPROVED"), EMRConsistencySeverity::Info, TEXT("no approved Tavian dialogue id exists yet, so the encounter flag cannot be cross-checked")); }
			else
			{
				if (Onb.bTavianEncounterDone && !bDialogueDone) Add(TEXT("TAVIAN_DONE_WITHOUT_EVIDENCE"), EMRConsistencySeverity::Warning, TEXT("onboarding records the Tavian encounter as done but the narrative save does not show the approved conversation completed: preserved; nothing is auto-replayed or auto-completed"), { TEXT("completedDialogues=") + Join(N.CompletedDialogues) });
				if (bDialogueDone && !Onb.bTavianEncounterDone) Add(TEXT("NARRATIVE_TAVIAN_DONE_ONB_NOT"), EMRConsistencySeverity::Info, TEXT("the narrative save shows the Tavian conversation completed but onboarding has not recorded it: onboarding does not auto-advance (design decision pending)"), { TEXT("completedDialogues=") + Join(N.CompletedDialogues) });
			}
			if (M.TavianEncounterEffectIds.Num() > 0)
			{
				TSet<FName> Fired; for (FName E : M.TavianEncounterEffectIds) if (N.FiredEffects.Contains(E)) Fired.Add(E);
				bool bDone = false; for (FName Id : M.TavianDialogueIds) if (N.CompletedDialogues.Contains(Id)) bDone = true;
				if (Fired.Num() > 0 && !bDone) Add(TEXT("INTERRUPTED_ENCOUNTER_EFFECTS"), EMRConsistencySeverity::Info, TEXT("one-time effects of the Tavian conversation were applied but the conversation is not completed (interrupted): a restart will not repeat them (D-7)"), { TEXT("ledger=") + Join(Fired) });
				if (bDone && Fired.Num() < M.TavianEncounterEffectIds.Num()) Add(TEXT("LEDGER_MISSING_FOR_COMPLETED"), EMRConsistencySeverity::Warning, TEXT("the Tavian conversation is completed but some of its one-time effect ids are absent from the ledger: they could fire again on a replay; nothing is invented or backfilled"), { TEXT("ledger=") + Join(N.FiredEffects) });
			}
			bool bAnyMission = false; TArray<FString> Ms; for (const TPair<FName, EMRQuestStatus>& P : N.Missions) if (P.Value != EMRQuestStatus::NotOffered) { bAnyMission = true; Ms.Add(FString::Printf(TEXT("%s=%d"), *P.Key.ToString(), (int32)P.Value)); }
			Ms.Sort();
			if (bAnyMission && !Onb.bTavianEncounterDone && !Onb.bOnboardingCompleted) Add(TEXT("MISSION_BEFORE_ENCOUNTER"), EMRConsistencySeverity::Info, TEXT("the narrative save has mission progress although onboarding has not recorded the Tavian encounter (optional quests or legacy progress): preserved, no action"), Ms);
		}
		if (Onb.LegacyOrigin == EMRLegacyOrigin::V1Completed) Add(TEXT("LEGACY_GRANDFATHERED_NO_SCAN"), EMRConsistencySeverity::Info, TEXT("completed under the legacy order: no in-world scan, transit or Core arrival is recorded and none is claimed"));
		return Rep;
	}
}
