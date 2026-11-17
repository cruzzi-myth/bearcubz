// Moon Racer - narrative registry + state (Phase 3B P5A). Content-independent.
//
// Owns: the validated content registry (NPCs, dialogue graphs, missions), the persistent narrative state (facts, completed
// conversations, one-time-effect ledger, objectives, mission statuses), the dialogue runtime, and the mission/objective logic.
// A content bundle is validated as a unit and registered atomically: invalid content never enters the registry.
// Local-only. No Passport/Supabase/website access.

#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "Narrative/MRNarrativeTypes.h"
#include "Narrative/MRNarrativeValidator.h"
#include "Narrative/MRNarrativeSaveGame.h"
#include "Narrative/MRDialogueRuntime.h"
#include "MRNarrativeSubsystem.generated.h"

struct FMRTrackedObjective
{
	bool bValid = false;
	FName MissionId, ObjectiveId;
	FText MissionTitle, ObjectiveText;
};

struct FMRNarrativeLoadInfo
{
	FMRNarrativeLoadReport Store;
	bool bVersionMismatch = false;       // the saved state was written against different content versions
	TArray<FString> Notes;
	TArray<FName> UnknownMissions;       // statuses in the save for missions the current bundle does not contain (kept, not applied)
};

/** Identity of the bundle currently registered through the registration layer (empty when registered directly, e.g. by P5A tests). */
struct FMRRegistrationInfo
{
	FString BundleId, BundleHash, Classification;
	EMREnvironment Environment = EMREnvironment::Unspecified;
	bool IsSet() const { return !BundleHash.IsEmpty(); }
};

/** Everything a failed registration must be able to put back. Plain data: valid only for the duration of one registration call (the objects stay referenced by the registry until swapped). */
struct FMRRegistrySnapshot
{
	TMap<FName, UMRNpcRecord*> Npcs; TMap<FName, UMRDialogueGraph*> Graphs; TMap<FName, UMRMissionRecord*> Missions; TArray<FName> MissionOrder;
	bool bHasBundle = false; FName QuestVersion, DialogueVersion;
	TMap<FName, TMap<FName, FString>> Strings;
	TArray<FMREffectMigration> Migrations;
	FMRRegistrationInfo Info;
};

DECLARE_MULTICAST_DELEGATE_TwoParams(FMROnMissionChanged, FName /*MissionId*/, EMRQuestStatus);
DECLARE_MULTICAST_DELEGATE_OneParam(FMROnObjectiveCompleted, FName /*ObjectiveId*/);
DECLARE_MULTICAST_DELEGATE(FMROnTrackerChanged);
DECLARE_MULTICAST_DELEGATE_OneParam(FMROnGameEvent, FName);
DECLARE_MULTICAST_DELEGATE_OneParam(FMROnDialogueCompleted, const FMRDialogueResult&);

UCLASS()
class MOONRACER_API UMRNarrativeSubsystem : public UGameInstanceSubsystem
{
	GENERATED_BODY()
public:
	virtual void Initialize(FSubsystemCollectionBase& Collection) override { Super::Initialize(Collection); Setup(); }
	/** Idempotent. Public so tests that construct the subsystem directly can call it. */
	void Setup();

	// ---- registry ----
	/** Validate then (only if error-free) atomically replace the registry. Any active conversation is cancelled first. */
	bool RegisterBundle(const FMRNarrativeBundle& Bundle, const FMRValidationPolicy& Policy, FMRValidationReport& OutReport);
	void ClearRegistry();
	bool HasBundle() const { return bHasBundle; }

	// ---- registration-layer primitives (used by FMRNarrativeRegistrar; each is all-or-nothing in memory) ----
	FMRRegistrySnapshot CaptureRegistry() const;
	/** Puts a captured registry back (records, versions, string tables, migrations, identity). Cancels any active conversation. */
	void RestoreRegistry(const FMRRegistrySnapshot& Snap);
	/** Register runtime string tables for the bundle being published and remember them (so a failure can restore the previous ones). */
	void StageStrings(const TMap<FName, TMap<FName, FString>>& Strings);
	/** Replace the registry contents with an ALREADY VALIDATED bundle. */
	void SwapRegistry(const FMRNarrativeBundle& Bundle, const TArray<FMREffectMigration>& Migrations, const FMRRegistrationInfo& Info);
	const FMRRegistrationInfo& GetRegistration() const { return Registration; }
	const TArray<FMREffectMigration>& GetMigrations() const { return Migrations; }
	int32 NumNpcs() const { return Npcs.Num(); } int32 NumGraphs() const { return Graphs.Num(); } int32 NumMissions() const { return Missions.Num(); }
	/** Successful registrations through the registration layer, oldest first (rollback uses it). */
	TArray<FMRRegistrationInfo> RegistrationHistory;
	/** Carry approved one-time-effect-id migrations into the saved ledger (adds the new id; never removes anything). Returns the number of ids carried. */
	int32 ApplyEffectMigrations();
	const UMRNpcRecord* FindNpc(FName NpcId) const { const TObjectPtr<UMRNpcRecord>* P = Npcs.Find(NpcId); return P ? P->Get() : nullptr; }
	const UMRDialogueGraph* FindGraph(FName GraphId) const { const TObjectPtr<UMRDialogueGraph>* P = Graphs.Find(GraphId); return P ? P->Get() : nullptr; }
	const UMRMissionRecord* FindMission(FName MissionId) const { const TObjectPtr<UMRMissionRecord>* P = Missions.Find(MissionId); return P ? P->Get() : nullptr; }
	const UMRMissionRecord* FindMissionOfObjective(FName ObjectiveId) const;
	/** Versions the current registry represents (what checkpoints are stamped with). */
	FMRContentVersions GetContentVersions() const;
	/** The Core manifest version is owned by the (blocked) Core content, not by this registry. */
	FName CoreManifestVersion = FName("unresolved");

	// ---- persistence ----
	FMRNarrativeLoadInfo LoadState();
	bool SaveState();
	bool bAutoSave = true;
	FString LastSaveError;
	int32 SaveCount = 0, SaveFailures = 0;
	const FMRNarrativeState& GetState() const { return State; }
	void ResetStateForTest() { State = FMRNarrativeState(); }
	FMRNarrativeState& StateForTest() { return State; }

	// ---- facts / conditions / effects ----
	bool IsFactSet(FName Fact) const { return State.Facts.Contains(Fact); }
	void SetFact(FName Fact) { State.Facts.Add(Fact); Persist(); }
	void ClearFact(FName Fact) { State.Facts.Remove(Fact); Persist(); }
	bool EvaluateConditions(const TArray<FMRDialogueCondition>& Conds) const;
	/** Applies one effect. One-time effects fire at most once per save (the ledger persists). Returns true if it was applied. */
	bool ApplyEffect(const FMRDialogueEffect& E);
	int32 EffectsApplied = 0, EffectsSuppressed = 0;

	// ---- missions & objectives ----
	EMRQuestStatus GetMissionStatus(FName MissionId) const { const EMRQuestStatus* S = State.Missions.Find(MissionId); return S ? *S : EMRQuestStatus::NotOffered; }
	bool OfferMission(FName MissionId);      // NotOffered -> Offered (idempotent)
	bool AcceptMission(FName MissionId);     // Offered/NotOffered -> Active (idempotent); first objective becomes current
	bool CompleteObjective(FName ObjectiveId);   // only the CURRENT objective of an ACTIVE mission
	/** A gameplay event completes the current objective of any active mission waiting on it. */
	void NotifyGameEvent(FName EventId);
	FMRTrackedObjective GetTrackedObjective() const;
	bool IsObjectiveCompleted(FName ObjectiveId) const { return State.CompletedObjectives.Contains(ObjectiveId); }

	// ---- standalone (non-mission) objective, used by IMRInteractionService ----
	void BeginStandaloneObjective(FName ObjectiveId, TFunction<void(EMRServiceResult)> Done);
	bool ReachStandaloneObjective(FName ObjectiveId);
	FName GetStandaloneObjective() const { return StandaloneObjectiveId; }

	// ---- NPCs & conversations ----
	bool IsNpcAvailable(FName NpcId) const;
	bool StartConversation(FName NpcId, FString* WhyNot = nullptr);
	UMRDialogueRuntime* GetRuntime() const { return Runtime; }
	/** Called by the runtime. */
	bool RecordDialogueCompleted(FName GraphId);   // returns true the first time
	void NotifyDialogueCompleted(const FMRDialogueResult& R);

	FMROnMissionChanged OnMissionChanged;
	FMROnObjectiveCompleted OnObjectiveCompleted;
	FMROnTrackerChanged OnTrackerChanged;
	FMROnGameEvent OnGameEvent;
	FMROnDialogueCompleted OnDialogueCompleted;

	FMRNarrativeLoadInfo LastLoad;

private:
	void Persist() { if (bAutoSave) SaveState(); }
	const FMRObjectiveDef* CurrentObjective(const UMRMissionRecord* M) const;

	UPROPERTY(Transient) TMap<FName, TObjectPtr<UMRNpcRecord>> Npcs;
	UPROPERTY(Transient) TMap<FName, TObjectPtr<UMRDialogueGraph>> Graphs;
	UPROPERTY(Transient) TMap<FName, TObjectPtr<UMRMissionRecord>> Missions;
	UPROPERTY(Transient) TArray<FName> MissionOrder;
	UPROPERTY(Transient) TObjectPtr<UMRDialogueRuntime> Runtime;
	FMRNarrativeState State;
	bool bHasBundle = false;
	TMap<FName, TMap<FName, FString>> RegisteredStrings;
	TArray<FMREffectMigration> Migrations;
	FMRRegistrationInfo Registration;
	FName QuestVersion, DialogueVersion;
	FName StandaloneObjectiveId;
	TFunction<void(EMRServiceResult)> StandaloneDone;
};
