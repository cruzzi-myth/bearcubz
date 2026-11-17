// Moon Racer - LOCAL narrative state persistence (Phase 3B P5A): facts, completed conversations, the one-time-effect ledger,
// completed objectives and mission statuses. Independent from avatar and onboarding saves; no Passport/Supabase.
// Same safety rules as the other stores: integrity envelope ("MRNV" | format | length | CRC32 | payload) verified BEFORE any engine
// deserialisation, temp-file + atomic replace (the previous valid save survives a failed write), corrupt/newer files are never
// loaded and never silently destroyed (backed up before being replaced), dedicated slots for tests.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/SaveGame.h"
#include "Onboarding/MROnboardingTypes.h"
#include "MRNarrativeSaveGame.generated.h"

namespace MRNarrative { constexpr int32 CurrentNarrativeSaveVersion = 1; }

USTRUCT()
struct MOONRACER_API FMRMissionProgress
{
	GENERATED_BODY()
	UPROPERTY(SaveGame) FName MissionId;
	UPROPERTY(SaveGame) EMRQuestStatus Status = EMRQuestStatus::NotOffered;
};

/** The in-memory narrative state. */
struct MOONRACER_API FMRNarrativeState
{
	TSet<FName> Facts, CompletedDialogues, FiredEffects, CompletedObjectives;
	TMap<FName, EMRQuestStatus> Missions;
	/** Deterministic text form (sorted) used for the checksum and for equality in tests. */
	FString ToCanonicalString() const;
	bool operator==(const FMRNarrativeState& O) const { return ToCanonicalString() == O.ToCanonicalString(); }
};

UCLASS()
class MOONRACER_API UMRNarrativeSaveGame : public USaveGame
{
	GENERATED_BODY()
public:
	UPROPERTY(SaveGame) int32 SaveVersion = MRNarrative::CurrentNarrativeSaveVersion;
	UPROPERTY(SaveGame) int32 Checksum = 0;
	/** Content versions the state was written against (validated on load, see UMRNarrativeSubsystem::LoadState). */
	UPROPERTY(SaveGame) FName QuestRegistryVersion;
	UPROPERTY(SaveGame) FName DialogueVersion;
	UPROPERTY(SaveGame) TArray<FName> Facts;
	UPROPERTY(SaveGame) TArray<FName> CompletedDialogues;
	UPROPERTY(SaveGame) TArray<FName> FiredEffects;
	UPROPERTY(SaveGame) TArray<FName> CompletedObjectives;
	UPROPERTY(SaveGame) TArray<FMRMissionProgress> Missions;
	UPROPERTY(SaveGame) FString Notice = TEXT("Local development narrative state. Not a Passport record.");

	void FromState(const FMRNarrativeState& S);
	FMRNarrativeState ToState() const;
	int32 ComputeChecksum() const;
};

struct FMRNarrativeLoadReport
{
	bool bExists = false;
	bool bValid = false;          // loaded and verified
	bool bRejectedNewer = false;  // written by a newer build: never loaded, never overwritten
	bool bCorrupt = false;
	FName SavedQuestVersion, SavedDialogueVersion;
	FString Why;
};

class MOONRACER_API FMRNarrativeStore
{
public:
	/** Default "MRNarrative_Local"; -MRNarrativeSlot=Name or SetSlotBaseOverride (tests) selects a dedicated slot. */
	static FString SlotBase();
	static void SetSlotBaseOverride(const FString& Base);
	static FString FilePath();
	static bool IsDefaultSlot() { return SlotBase() == TEXT("MRNarrative_Local"); }

	static FMRNarrativeState Load(FMRNarrativeLoadReport& OutReport);
	static bool Save(const FMRNarrativeState& State, FName QuestVersion, FName DialogueVersion, FString& OutError);
	static void Delete();
	/** TEST HOOK: write a SaveGame object (any version/checksum) with a correct envelope. */
	static bool WriteForTest(UMRNarrativeSaveGame* Save);
	/** TEST HOOK: fail after the temp file is written, before the atomic replace. */
	static bool GFailAfterTempWrite;
};
