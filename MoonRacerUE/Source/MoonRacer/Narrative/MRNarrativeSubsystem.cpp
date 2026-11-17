#include "Narrative/MRNarrativeSubsystem.h"
#include "Internationalization/StringTableRegistry.h"
#include "MoonRacer.h"

void UMRNarrativeSubsystem::Setup()
{
	MRNarrative::EnsureUiStrings();
	if (!Runtime) { Runtime = NewObject<UMRDialogueRuntime>(this); Runtime->Init(this); }
}

bool UMRNarrativeSubsystem::RegisterBundle(const FMRNarrativeBundle& B, const FMRValidationPolicy& Policy, FMRValidationReport& Out)
{
	Setup();
	FMRValidationPolicy Eff = Policy;
	if (MRNarrative::CurrentEnvironment() == EMREnvironment::Production) Eff.bAllowTestFixtures = false;   // a production process can never register fixtures, whatever the caller asks
	MRNarrative::ValidateBundle(B, Eff, Out);
	for (const FMRDiagnostic& D : Out.Items) UE_LOG(LogMoonRacer, Display, TEXT("MRNARR|VALIDATE|%s"), *D.ToString());
	if (Out.HasErrors()) { UE_LOG(LogMoonRacer, Warning, TEXT("MRNARR|BUNDLE|rejected (%d errors); registry unchanged"), Out.NumErrors()); return false; }
	SwapRegistry(B, TArray<FMREffectMigration>(), FMRRegistrationInfo());
	UE_LOG(LogMoonRacer, Display, TEXT("MRNARR|BUNDLE|registered npcs=%d graphs=%d missions=%d dialogueVersion=%s questVersion=%s"), Npcs.Num(), Graphs.Num(), Missions.Num(), *DialogueVersion.ToString(), *QuestVersion.ToString());
	return true;
}

void UMRNarrativeSubsystem::SwapRegistry(const FMRNarrativeBundle& B, const TArray<FMREffectMigration>& InMigrations, const FMRRegistrationInfo& Info)
{
	ClearRegistry();
	for (UMRNpcRecord* N : B.Npcs) Npcs.Add(N->RecordId, N);
	for (UMRDialogueGraph* G : B.Graphs) Graphs.Add(G->RecordId, G);
	for (UMRMissionRecord* M : B.Missions) { Missions.Add(M->RecordId, M); MissionOrder.Add(M->RecordId); }
	DialogueVersion = MRNarrative::DialogueVersionOf(B); QuestVersion = MRNarrative::QuestVersionOf(B);
	Migrations = InMigrations; Registration = Info;
	bHasBundle = true;
}

FMRRegistrySnapshot UMRNarrativeSubsystem::CaptureRegistry() const
{
	FMRRegistrySnapshot S;
	for (const TPair<FName, TObjectPtr<UMRNpcRecord>>& P : Npcs) S.Npcs.Add(P.Key, P.Value);
	for (const TPair<FName, TObjectPtr<UMRDialogueGraph>>& P : Graphs) S.Graphs.Add(P.Key, P.Value);
	for (const TPair<FName, TObjectPtr<UMRMissionRecord>>& P : Missions) S.Missions.Add(P.Key, P.Value);
	S.MissionOrder = MissionOrder; S.bHasBundle = bHasBundle; S.QuestVersion = QuestVersion; S.DialogueVersion = DialogueVersion;
	S.Strings = RegisteredStrings; S.Migrations = Migrations; S.Info = Registration;
	return S;
}

void UMRNarrativeSubsystem::RestoreRegistry(const FMRRegistrySnapshot& S)
{
	if (Runtime && Runtime->IsActive()) Runtime->Cancel(TEXT("content registry restored"));
	Npcs.Reset(); Graphs.Reset(); Missions.Reset();
	for (const TPair<FName, UMRNpcRecord*>& P : S.Npcs) Npcs.Add(P.Key, P.Value);
	for (const TPair<FName, UMRDialogueGraph*>& P : S.Graphs) Graphs.Add(P.Key, P.Value);
	for (const TPair<FName, UMRMissionRecord*>& P : S.Missions) Missions.Add(P.Key, P.Value);
	MissionOrder = S.MissionOrder; bHasBundle = S.bHasBundle; QuestVersion = S.QuestVersion; DialogueVersion = S.DialogueVersion;
	Migrations = S.Migrations; Registration = S.Info;
	// string tables: drop tables the failed bundle added, put the previous contents back
	for (const TPair<FName, TMap<FName, FString>>& P : RegisteredStrings) if (!S.Strings.Contains(P.Key)) FStringTableRegistry::Get().UnregisterStringTable(P.Key);
	for (const TPair<FName, TMap<FName, FString>>& P : S.Strings) MRNarrative::RegisterStrings(P.Key, P.Value);
	RegisteredStrings = S.Strings;
}

void UMRNarrativeSubsystem::StageStrings(const TMap<FName, TMap<FName, FString>>& Strings)
{
	for (const TPair<FName, TMap<FName, FString>>& P : Strings) MRNarrative::RegisterStrings(P.Key, P.Value);
	RegisteredStrings = Strings;
}

int32 UMRNarrativeSubsystem::ApplyEffectMigrations()
{
	int32 N = 0;
	for (const FMREffectMigration& M : Migrations)
		if (!M.bRetire && State.FiredEffects.Contains(M.From) && !State.FiredEffects.Contains(M.To)) { State.FiredEffects.Add(M.To); ++N; }
	if (N > 0) { UE_LOG(LogMoonRacer, Display, TEXT("MRNARR|MIGRATE|carried %d one-time effect id(s) into the ledger"), N); Persist(); }
	return N;
}

void UMRNarrativeSubsystem::ClearRegistry()
{
	if (Runtime && Runtime->IsActive()) Runtime->Cancel(TEXT("content registry changed"));
	Npcs.Reset(); Graphs.Reset(); Missions.Reset(); MissionOrder.Reset();
	bHasBundle = false; DialogueVersion = NAME_None; QuestVersion = NAME_None; Migrations.Reset(); Registration = FMRRegistrationInfo();
}

const UMRMissionRecord* UMRNarrativeSubsystem::FindMissionOfObjective(FName ObjectiveId) const
{
	for (const TPair<FName, TObjectPtr<UMRMissionRecord>>& P : Missions) for (const FMRObjectiveDef& O : P.Value->Objectives) if (O.ObjectiveId == ObjectiveId) return P.Value;
	return nullptr;
}

FMRContentVersions UMRNarrativeSubsystem::GetContentVersions() const
{
	FMRContentVersions V;
	V.CoreManifestVersion = CoreManifestVersion;
	V.QuestRegistryVersion = QuestVersion.IsNone() ? FName("unresolved") : QuestVersion;
	V.DialogueVersion = DialogueVersion.IsNone() ? FName("unresolved") : DialogueVersion;
	return V;
}

// ---- persistence -------------------------------------------------------------------------------------------------
bool UMRNarrativeSubsystem::SaveState()
{
	const FMRContentVersions V = GetContentVersions();
	FString Err;
	if (FMRNarrativeStore::Save(State, V.QuestRegistryVersion, V.DialogueVersion, Err)) { ++SaveCount; LastSaveError.Empty(); return true; }
	++SaveFailures; LastSaveError = Err;
	UE_LOG(LogMoonRacer, Warning, TEXT("MRNARR|SAVE|failed: %s (state kept in memory)"), *Err);
	return false;
}

FMRNarrativeLoadInfo UMRNarrativeSubsystem::LoadState()
{
	FMRNarrativeLoadInfo Info;
	State = FMRNarrativeStore::Load(Info.Store);
	Info.Notes.Add(Info.Store.Why);
	if (Info.Store.bValid)
	{
		const FMRContentVersions Cur = GetContentVersions();
		if (bHasBundle && (Info.Store.SavedQuestVersion != Cur.QuestRegistryVersion || Info.Store.SavedDialogueVersion != Cur.DialogueVersion))
		{
			Info.bVersionMismatch = true;
			Info.Notes.Add(FString::Printf(TEXT("content version mismatch (saved quest=%s dialogue=%s; current quest=%s dialogue=%s): saved progress is kept; entries for unknown content are retained but not applied"),
				*Info.Store.SavedQuestVersion.ToString(), *Info.Store.SavedDialogueVersion.ToString(), *Cur.QuestRegistryVersion.ToString(), *Cur.DialogueVersion.ToString()));
		}
		bool bChanged = ApplyEffectMigrations() > 0;
		for (const TPair<FName, EMRQuestStatus>& P : State.Missions)
		{
			const UMRMissionRecord* M = FindMission(P.Key);
			if (!M) { if (bHasBundle) Info.UnknownMissions.Add(P.Key); continue; }
			// Consistency derived from recorded facts only (never invented): an Active mission whose objectives are all recorded complete is Completed.
			if (P.Value == EMRQuestStatus::Active && !CurrentObjective(M)) { State.Missions[P.Key] = EMRQuestStatus::Completed; bChanged = true; Info.Notes.Add(TEXT("mission ") + P.Key.ToString() + TEXT(": all objectives recorded complete; status set to Completed")); }
		}
		if (Info.Store.bValid && bHasBundle && (Info.bVersionMismatch || bChanged)) Persist(); // re-stamp with the current versions (only when a bundle defines them)
	}
	for (const FString& N : Info.Notes) UE_LOG(LogMoonRacer, Display, TEXT("MRNARR|LOAD|%s"), *N);
	LastLoad = Info;
	return Info;
}

// ---- conditions & effects ------------------------------------------------------------------------------------------
bool UMRNarrativeSubsystem::EvaluateConditions(const TArray<FMRDialogueCondition>& Conds) const
{
	for (const FMRDialogueCondition& K : Conds)
	{
		bool bOk = false;
		switch (K.Type)
		{
		case EMRConditionType::FactSet: bOk = IsFactSet(K.Subject); break;
		case EMRConditionType::FactNotSet: bOk = !IsFactSet(K.Subject); break;
		case EMRConditionType::MissionStatus: bOk = GetMissionStatus(K.Subject) == K.Status; break;
		case EMRConditionType::DialogueCompleted: bOk = State.CompletedDialogues.Contains(K.Subject); break;
		case EMRConditionType::ObjectiveCompleted: bOk = IsObjectiveCompleted(K.Subject); break;
		}
		if (!bOk) return false;
	}
	return true;
}

bool UMRNarrativeSubsystem::ApplyEffect(const FMRDialogueEffect& E)
{
	if (E.bOneTime)
	{
		if (E.EffectId.IsNone()) { UE_LOG(LogMoonRacer, Warning, TEXT("MRNARR|EFFECT|one-time effect without an id ignored")); return false; }
		if (State.FiredEffects.Contains(E.EffectId)) { ++EffectsSuppressed; UE_LOG(LogMoonRacer, Display, TEXT("MRNARR|EFFECT|suppressed repeat of one-time effect %s"), *E.EffectId.ToString()); return false; }
		State.FiredEffects.Add(E.EffectId);   // ledger first: a re-entrant event can never fire it twice
	}
	++EffectsApplied;
	const bool bPrev = bAutoSave; bAutoSave = false;   // one write per effect, not one per nested change
	switch (E.Type)
	{
	case EMREffectType::SetFact: State.Facts.Add(E.Subject); break;
	case EMREffectType::ClearFact: State.Facts.Remove(E.Subject); break;
	case EMREffectType::OfferMission: OfferMission(E.Subject); break;
	case EMREffectType::AcceptMission: AcceptMission(E.Subject); break;
	case EMREffectType::CompleteObjective: CompleteObjective(E.Subject); break;
	case EMREffectType::EmitEvent: NotifyGameEvent(E.Subject); break;
	}
	bAutoSave = bPrev;
	Persist();
	return true;
}

// ---- missions & objectives -----------------------------------------------------------------------------------------
const FMRObjectiveDef* UMRNarrativeSubsystem::CurrentObjective(const UMRMissionRecord* M) const
{
	if (!M) return nullptr;
	for (const FMRObjectiveDef& O : M->Objectives) if (!State.CompletedObjectives.Contains(O.ObjectiveId)) return &O;
	return nullptr;
}

bool UMRNarrativeSubsystem::OfferMission(FName Id)
{
	if (!FindMission(Id)) return false;
	if (GetMissionStatus(Id) != EMRQuestStatus::NotOffered) return true; // idempotent
	State.Missions.Add(Id, EMRQuestStatus::Offered);
	OnMissionChanged.Broadcast(Id, EMRQuestStatus::Offered); OnTrackerChanged.Broadcast(); Persist();
	return true;
}

bool UMRNarrativeSubsystem::AcceptMission(FName Id)
{
	const UMRMissionRecord* M = FindMission(Id);
	if (!M) return false;
	const EMRQuestStatus Cur = GetMissionStatus(Id);
	if (Cur == EMRQuestStatus::Active || Cur == EMRQuestStatus::Completed) return true; // idempotent: never re-activates or resets
	State.Missions.Add(Id, EMRQuestStatus::Active);
	UE_LOG(LogMoonRacer, Display, TEXT("MRNARR|MISSION|accepted %s"), *Id.ToString());
	OnMissionChanged.Broadcast(Id, EMRQuestStatus::Active); OnTrackerChanged.Broadcast(); Persist();
	return true;
}

bool UMRNarrativeSubsystem::CompleteObjective(FName ObjectiveId)
{
	const UMRMissionRecord* M = FindMissionOfObjective(ObjectiveId);
	if (!M || GetMissionStatus(M->RecordId) != EMRQuestStatus::Active) return false;
	const FMRObjectiveDef* Cur = CurrentObjective(M);
	if (!Cur || Cur->ObjectiveId != ObjectiveId) return false;   // out of order or already complete
	State.CompletedObjectives.Add(ObjectiveId);
	UE_LOG(LogMoonRacer, Display, TEXT("MRNARR|OBJECTIVE|completed %s (mission %s)"), *ObjectiveId.ToString(), *M->RecordId.ToString());
	OnObjectiveCompleted.Broadcast(ObjectiveId);
	if (!CurrentObjective(M)) { State.Missions.Add(M->RecordId, EMRQuestStatus::Completed); OnMissionChanged.Broadcast(M->RecordId, EMRQuestStatus::Completed); }
	OnTrackerChanged.Broadcast(); Persist();
	return true;
}

void UMRNarrativeSubsystem::NotifyGameEvent(FName EventId)
{
	if (EventId.IsNone()) return;
	OnGameEvent.Broadcast(EventId);
	for (FName Id : MissionOrder)
	{
		if (GetMissionStatus(Id) != EMRQuestStatus::Active) continue;
		if (const FMRObjectiveDef* O = CurrentObjective(FindMission(Id))) if (O->CompletionEventId == EventId) CompleteObjective(O->ObjectiveId);
	}
}

FMRTrackedObjective UMRNarrativeSubsystem::GetTrackedObjective() const
{
	FMRTrackedObjective T;
	for (FName Id : MissionOrder)
	{
		if (GetMissionStatus(Id) != EMRQuestStatus::Active) continue;
		const UMRMissionRecord* M = FindMission(Id); const FMRObjectiveDef* O = CurrentObjective(M);
		if (!M || !O) continue;
		T.bValid = true; T.MissionId = Id; T.ObjectiveId = O->ObjectiveId;
		T.MissionTitle = MRNarrative::ResolveText(M->StringTableId, M->TitleKey); T.ObjectiveText = MRNarrative::ResolveText(M->StringTableId, O->TextKey);
		return T;
	}
	if (!StandaloneObjectiveId.IsNone()) { T.bValid = true; T.ObjectiveId = StandaloneObjectiveId; T.MissionTitle = MRNarrative::UiText(TEXT("objective")); T.ObjectiveText = FText::FromName(StandaloneObjectiveId); }
	return T;
}

void UMRNarrativeSubsystem::BeginStandaloneObjective(FName ObjectiveId, TFunction<void(EMRServiceResult)> Done)
{
	StandaloneObjectiveId = ObjectiveId; StandaloneDone = MoveTemp(Done); OnTrackerChanged.Broadcast();
}

bool UMRNarrativeSubsystem::ReachStandaloneObjective(FName ObjectiveId)
{
	if (StandaloneObjectiveId.IsNone() || StandaloneObjectiveId != ObjectiveId) return false;
	StandaloneObjectiveId = NAME_None; TFunction<void(EMRServiceResult)> Cb = MoveTemp(StandaloneDone); StandaloneDone = nullptr;
	OnTrackerChanged.Broadcast();
	if (Cb) Cb(EMRServiceResult::Ok);
	return true;
}

// ---- NPCs & conversations -------------------------------------------------------------------------------------------
bool UMRNarrativeSubsystem::IsNpcAvailable(FName NpcId) const
{
	const UMRNpcRecord* N = FindNpc(NpcId);
	return N && (N->AvailabilityFact.IsNone() || IsFactSet(N->AvailabilityFact));
}

bool UMRNarrativeSubsystem::StartConversation(FName NpcId, FString* Why)
{
	auto No = [&](const TCHAR* W) { if (Why) *Why = W; return false; };
	const UMRNpcRecord* N = FindNpc(NpcId);
	if (!N) return No(TEXT("unknown NPC"));
	if (!IsNpcAvailable(NpcId)) return No(TEXT("NPC is not available"));
	if (N->DefaultDialogueGraphId.IsNone()) return No(TEXT("NPC has no conversation"));
	return Runtime->Start(N->DefaultDialogueGraphId, nullptr, Why);
}

bool UMRNarrativeSubsystem::RecordDialogueCompleted(FName GraphId)
{
	const bool bFirst = !State.CompletedDialogues.Contains(GraphId);
	State.CompletedDialogues.Add(GraphId);
	Persist();
	return bFirst;
}

void UMRNarrativeSubsystem::NotifyDialogueCompleted(const FMRDialogueResult& R)
{
	OnDialogueCompleted.Broadcast(R);
	NotifyGameEvent(R.CompletionEventId);
}
