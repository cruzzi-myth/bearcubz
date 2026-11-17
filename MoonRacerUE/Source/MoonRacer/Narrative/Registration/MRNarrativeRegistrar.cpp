#include "Narrative/Registration/MRNarrativeRegistrar.h"
#include "MoonRacer.h"

int32 FMRNarrativeRegistrar::GFailAtStep = 0;

FString FMRRegistrationResult::Summary() const
{
	FString S = FString::Printf(TEXT("%s bundle=%s hash=%s\n"), bOk ? TEXT("REGISTERED") : TEXT("REFUSED"), *BundleId, *BundleHash.Left(12));
	S += Report.Summary();
	for (const FString& C : Conflicts) S += TEXT("CONFLICT ") + C + TEXT("\n");
	for (const FString& N : Notes) S += TEXT("NOTE ") + N + TEXT("\n");
	return S;
}

namespace
{
	bool Empty(const FMRNarrativeState& S) { return S.Facts.Num() + S.CompletedDialogues.Num() + S.FiredEffects.Num() + S.CompletedObjectives.Num() + S.Missions.Num() == 0; }

	// Would registering this bundle contradict what the player's save already says? Conflicts refuse the registration; notes only inform.
	void CheckSaveCompat(UMRNarrativeSubsystem* N, const FMRLoadedBundle& L, const FMRRegistrationRequest& Req, FMRRegistrationResult& R)
	{
		FMRNarrativeState S = N->GetState();
		if (Empty(S))
		{
			FMRNarrativeLoadReport LR; S = FMRNarrativeStore::Load(LR);
			if (LR.bRejectedNewer) { R.Report.Error(TEXT("SAVE_NEWER_VERSION"), FName(*R.BundleId), TEXT("the narrative save was written by a newer build and cannot be interpreted; registration refused and the save left untouched")); R.Conflicts.Add(TEXT("SAVE_NEWER_VERSION")); return; }
			if (LR.bCorrupt) R.Notes.Add(TEXT("the existing narrative save is unreadable; it is preserved on disk (backed up before any new save replaces it)"));
		}
		TMap<FName, const UMRMissionRecord*> NewMissions; for (const UMRMissionRecord* M : L.Bundle.Missions) NewMissions.Add(M->RecordId, M);
		TSet<FName> NewEffects;
		for (const UMRDialogueGraph* G : L.Bundle.Graphs)
			for (const FMRDialogueNode& Nd : G->Nodes)
			{
				for (const FMRDialogueEffect& E : Nd.OnEnterEffects) if (E.bOneTime) NewEffects.Add(E.EffectId);
				for (const FMRDialogueChoice& C : Nd.Choices) for (const FMRDialogueEffect& E : C.Effects) if (E.bOneTime) NewEffects.Add(E.EffectId);
			}
		auto Conflict = [&](const TCHAR* Code, FName Rec, const FString& Msg) { R.Report.Error(Code, Rec, Msg); R.Conflicts.Add(FString::Printf(TEXT("%s [%s]: %s"), Code, *Rec.ToString(), *Msg)); };

		for (const TPair<FName, EMRQuestStatus>& P : S.Missions)
		{
			if (NewMissions.Contains(P.Key)) continue;
			if (P.Value == EMRQuestStatus::Active || P.Value == EMRQuestStatus::Offered)
			{
				if (!Req.bAcceptRemovedMissions) Conflict(TEXT("ACTIVE_MISSION_REMOVED"), P.Key, TEXT("the save has this mission Active/Offered but the new bundle does not contain it; set bAcceptRemovedMissions to register anyway (its progress is retained but not applied)"));
				else R.Notes.Add(FString::Printf(TEXT("mission %s is Active/Offered in the save but absent from the bundle: retained, not applied (explicitly accepted)"), *P.Key.ToString()));
			}
			else R.Notes.Add(FString::Printf(TEXT("mission %s (status %d) is absent from the bundle: retained, not applied"), *P.Key.ToString(), (int32)P.Value));
		}
		for (const TPair<FName, const UMRMissionRecord*>& P : NewMissions)
		{
			const EMRQuestStatus* St = S.Missions.Find(P.Key);
			if (!St || *St == EMRQuestStatus::NotOffered) continue;
			bool bGap = false;   // objectives complete strictly in order: the recorded completed objectives must be a PREFIX of the new order
			for (const FMRObjectiveDef& O : P.Value->Objectives)
			{
				const bool bDone = S.CompletedObjectives.Contains(O.ObjectiveId);
				if (!bDone) bGap = true;
				else if (bGap) { Conflict(TEXT("OBJECTIVE_ORDER_CONFLICT"), P.Key, FString::Printf(TEXT("objective '%s' is recorded complete but an earlier objective of the new mission is not; the objective order changed incompatibly with the save"), *O.ObjectiveId.ToString())); break; }
			}
		}
		for (const FName& E : S.FiredEffects)
		{
			if (NewEffects.Contains(E)) continue;
			const bool bMigrated = L.Meta.Migrations.ContainsByPredicate([&](const FMREffectMigration& X) { return X.From == E; });
			if (bMigrated) continue;
			if (Req.Environment == EMREnvironment::Production) Conflict(TEXT("EFFECT_HISTORY_CONFLICT"), E, TEXT("a one-time effect id in the player's ledger is absent from the bundle and not covered by an approved migration; production registration refused"));
			else R.Notes.Add(FString::Printf(TEXT("one-time effect id %s in the ledger is absent from the bundle (development: allowed; the old entry is kept)"), *E.ToString()));
		}
		for (const FName& D : S.CompletedDialogues) if (!L.Bundle.Graphs.ContainsByPredicate([&](const UMRDialogueGraph* G) { return G->RecordId == D; })) R.Notes.Add(FString::Printf(TEXT("completed dialogue %s is absent from the bundle: kept in the save, unused"), *D.ToString()));
	}
}

FMRRegistrationResult FMRNarrativeRegistrar::RegisterLoaded(UMRNarrativeSubsystem* N, const FMRRegistrationRequest& Req, FMRLoadedBundle& L)
{
	FMRRegistrationResult R; R.BundleId = Req.BundleId; R.BundleHash = L.Meta.BundleHash;
	const FName Rec = FName(*Req.BundleId);
	if (!N) { R.Report.Error(TEXT("NO_SUBSYSTEM"), Rec, TEXT("no narrative subsystem")); return R; }
	N->Setup();

	// ---- environment & policy
	if (Req.Environment == EMREnvironment::Unspecified) { R.Report.Error(TEXT("ENV_UNSPECIFIED"), Rec, TEXT("the registration request must name an environment (Development or Production)")); return R; }
	if (Req.Environment == EMREnvironment::Development && MRNarrative::CurrentEnvironment() == EMREnvironment::Production) { R.Report.Error(TEXT("ENV_NOT_PERMITTED"), Rec, TEXT("this process runs in the Production environment; a Development registration is not permitted")); return R; }
	const bool bProduction = Req.Environment == EMREnvironment::Production;

	// ---- identity, classification, versions
	if (!L.Meta.BundleId.Equals(Req.BundleId)) R.Report.Error(TEXT("IDENTITY_MISMATCH"), Rec, FString::Printf(TEXT("loaded bundle id '%s' is not the requested '%s'"), *L.Meta.BundleId, *Req.BundleId));
	if (!Req.BundleHash.IsEmpty() && !L.Meta.BundleHash.Left(Req.BundleHash.Len()).Equals(Req.BundleHash, ESearchCase::IgnoreCase)) R.Report.Error(TEXT("IDENTITY_MISMATCH"), Rec, TEXT("loaded bundle hash is not the pinned hash"));
	if (L.Meta.BundleHash.IsEmpty() || L.Meta.DialogueVersion.IsEmpty() || L.Meta.QuestVersion.IsEmpty()) R.Report.Error(TEXT("MISSING_VERSION"), Rec, TEXT("the bundle metadata lacks a hash or versions"));
	if (bProduction && L.Meta.Classification != TEXT("PRODUCTION")) R.Report.Error(TEXT("FIXTURE_NOT_ALLOWED"), Rec, TEXT("a TEST_FIXTURE bundle cannot be registered in the Production environment"));
	const bool bMetaFixture = L.Meta.Classification == TEXT("TEST_FIXTURE");
	auto Check = [&](const UMRNarrativeRecordBase* B, const FString& Version)
	{
		if (!B) { R.Report.Error(TEXT("NULL_RECORD"), Rec, TEXT("a null record is in the bundle")); return; }
		if (B->ContentVersion.ToString() != Version) R.Report.Error(TEXT("VERSION_MISMATCH"), B->RecordId, FString::Printf(TEXT("record version '%s' differs from the bundle version '%s'"), *B->ContentVersion.ToString(), *Version));
		if (B->bTestFixture != bMetaFixture) R.Report.Error(TEXT("CLASSIFICATION_MISMATCH"), B->RecordId, TEXT("the record's fixture flag contradicts the bundle classification"));
	};
	for (const UMRNpcRecord* X : L.Bundle.Npcs) Check(X, L.Meta.DialogueVersion);
	for (const UMRDialogueGraph* X : L.Bundle.Graphs) Check(X, L.Meta.DialogueVersion);
	for (const UMRMissionRecord* X : L.Bundle.Missions) Check(X, L.Meta.QuestVersion);
	if (R.Report.HasErrors()) return R;

	// ---- provenance, references, text keys, fixture isolation (the full validator, against the bundle's own strings)
	FMRValidationPolicy Pol; Pol.bAllowTestFixtures = !bProduction;
	const TFunction<bool(FName, FName)> Lookup = [&L](FName T, FName K) { const TMap<FName, FString>* M = L.Strings.Find(T); return M && M->Contains(K); };
	MRNarrative::ValidateBundle(L.Bundle, Pol, R.Report, &Lookup);
	if (bProduction) for (const TPair<FName, TMap<FName, FString>>& T : L.Strings) for (const TPair<FName, FString>& E : T.Value) if (E.Value.StartsWith(TEXT("TEST FIXTURE - NONCANON"))) R.Report.Error(TEXT("PRODUCTION_FIXTURE_TEXT"), T.Key, FString::Printf(TEXT("string '%s' carries the TEST FIXTURE - NONCANON label"), *E.Key.ToString()));
	if (R.Report.HasErrors()) return R;

	// ---- existing saves
	CheckSaveCompat(N, L, Req, R);
	if (R.Report.HasErrors()) { UE_LOG(LogMoonRacer, Warning, TEXT("MRNARR|REGISTER|refused: save conflict; registry and save preserved")); return R; }

	// ---- all-or-nothing commit
	const FMRRegistrySnapshot Snap = N->CaptureRegistry();
	auto Abort = [&](const TCHAR* Why) { N->RestoreRegistry(Snap); R.Report.Error(TEXT("REGISTRATION_FAILED"), Rec, FString::Printf(TEXT("%s; the previous registry was restored"), Why)); UE_LOG(LogMoonRacer, Warning, TEXT("MRNARR|REGISTER|failed: %s; previous registry restored"), Why); return R; };
	if (GFailAtStep == 1) return Abort(TEXT("injected failure before strings"));
	N->StageStrings(L.Strings);
	if (GFailAtStep == 2) return Abort(TEXT("injected failure after strings"));
	FMRRegistrationInfo Info; Info.BundleId = L.Meta.BundleId; Info.BundleHash = L.Meta.BundleHash; Info.Classification = L.Meta.Classification; Info.Environment = Req.Environment;
	N->SwapRegistry(L.Bundle, L.Meta.Migrations, Info);
	if (GFailAtStep == 3) return Abort(TEXT("injected failure after swap"));
	N->RegistrationHistory.Add(Info);
	N->ApplyEffectMigrations();
	if (Req.bLoadSaveAfter) R.Load = N->LoadState();
	R.bOk = true;
	UE_LOG(LogMoonRacer, Display, TEXT("MRNARR|REGISTER|registered %s %s env=%d"), *Info.BundleId, *Info.BundleHash.Left(12), (int32)Req.Environment);
	return R;
}

FMRRegistrationResult FMRNarrativeRegistrar::Register(UMRNarrativeSubsystem* N, const FMRRegistrationRequest& Req)
{
	FMRRegistrationResult R; R.BundleId = Req.BundleId;
	const FName Rec = FName(*Req.BundleId);
	// environment gates run BEFORE anything is loaded
	if (Req.Environment == EMREnvironment::Unspecified) { R.Report.Error(TEXT("ENV_UNSPECIFIED"), Rec, TEXT("the registration request must name an environment (Development or Production)")); return R; }
	if (Req.Environment == EMREnvironment::Development && MRNarrative::CurrentEnvironment() == EMREnvironment::Production) { R.Report.Error(TEXT("ENV_NOT_PERMITTED"), Rec, TEXT("this process runs in the Production environment; a Development registration is not permitted")); return R; }
	if (Req.BundleId.IsEmpty()) { R.Report.Error(TEXT("EMPTY_ID"), Rec, TEXT("the request must name a bundle id")); return R; }
	FString Hash12 = Req.BundleHash.Left(12);
	if (Hash12.IsEmpty())
	{
		const FMRActiveReceipt Rc = FMRNarrativeImporter::ReadActive(Req.OutputRoot, Req.BundleId);
		if (!Rc.bValid) { R.Report.Error(TEXT("NO_ACTIVE_BUNDLE"), Rec, TEXT("no active imported bundle with this id")); return R; }
		if (Req.Environment == EMREnvironment::Production && Rc.Classification != TEXT("PRODUCTION")) { R.Report.Error(TEXT("FIXTURE_NOT_ALLOWED"), Rec, TEXT("the active bundle is a TEST_FIXTURE bundle; it is not loaded in the Production environment")); return R; }
		Hash12 = Rc.BundleHash.Left(12);
	}
	FMRLoadedBundle L;
	if (!FMRNarrativeImporter::LoadFolder(Req.OutputRoot, Req.BundleId, Hash12, L, R.Report)) return R;
	return RegisterLoaded(N, Req, L);
}

FMRRegistrationResult FMRNarrativeRegistrar::Rollback(UMRNarrativeSubsystem* N, const FMRRegistrationRequest& Template)
{
	FMRRegistrationResult R;
	if (!N || N->RegistrationHistory.Num() < 2) { R.Report.Error(TEXT("NO_PREVIOUS_BUNDLE"), FName("rollback"), TEXT("there is no previously registered bundle to roll back to")); return R; }
	const FMRRegistrationInfo Target = N->RegistrationHistory[N->RegistrationHistory.Num() - 2];
	FMRRegistrationRequest Req = Template; Req.BundleId = Target.BundleId; Req.BundleHash = Target.BundleHash;
	R = Register(N, Req);
	if (R.bOk) { N->RegistrationHistory.RemoveAt(N->RegistrationHistory.Num() - 3, 2); }   // [.., prev, cur, prev'] -> [.., prev']
	return R;
}
