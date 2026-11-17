// Moon Racer - LOCAL onboarding checkpoints (Phase 3B P2).
// Independent from avatar appearance (UMRAvatarSaveGame) and from Passport/Supabase: nothing here talks to any service.
// Files use a small integrity envelope (magic + length + CRC32) that is verified BEFORE any engine deserialisation:
// UGameplayStatics::LoadGameFromSlot hard-asserts (engine crash) on garbage .sav files, which must never happen for a player's
// corrupted progress file.
// Two alternating slots (<base>_A / <base>_B) with a monotonic WriteGeneration. A write goes to the slot that does NOT hold
// the latest valid checkpoint and is read back and verified before it counts, so a crash mid-write leaves the previous
// checkpoint intact. Saves written by a newer build are never overwritten.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/SaveGame.h"
#include "Onboarding/MROnboardingTypes.h"
#include "MRProgressSaveGame.generated.h"

UCLASS()
class MOONRACER_API UMRProgressSaveGame : public USaveGame
{
	GENERATED_BODY()

public:
	UPROPERTY(SaveGame) int32 SaveVersion = MROnboarding::CurrentProgressVersion;
	/** Strictly increasing across writes; decides which slot is newest. */
	UPROPERTY(SaveGame) int32 WriteGeneration = 0;
	UPROPERTY(SaveGame) int32 Checksum = 0;
	UPROPERTY(SaveGame) FMRProgressRecord Record;

	/** v0 (legacy, test-defined) format: a plain stage index and one flag. Read only by the migration. */
	UPROPERTY(SaveGame) int32 LegacyStageIndex = 0;
	UPROPERTY(SaveGame) bool bLegacyArrivalSeen = false;

	UPROPERTY(SaveGame) FString Notice = TEXT("Local development onboarding progress. Not a Passport record.");
};

struct FMRProgressLoadReport
{
	bool bExistsA = false, bExistsB = false;
	bool bValidA = false, bValidB = false;
	int32 GenerationA = -1, GenerationB = -1;
	FString ChosenSlot;                 // "A", "B" or empty when falling back
	int32 ChosenGeneration = -1;
	bool bFallbackFresh = false;        // no valid checkpoint: a brand-new record was returned
	bool bMigrated = false;
	bool bRejectedNewerVersion = false;
	TArray<FString> Notes;
};

struct FMRProgressSaveResult
{
	bool bOk = false;
	FString Slot;
	int32 Generation = -1;
	FString Error;
};

class MOONRACER_API FMRProgressStore
{
public:
	/** Base slot name. Default "MRProgress_Local". Override with -MRProgressSlot=Name or SetSlotBaseOverride (tests). */
	static FString SlotBase();
	static void SetSlotBaseOverride(const FString& Base);
	static FString SlotName(bool bSlotB) { return SlotBase() + (bSlotB ? TEXT("_B") : TEXT("_A")); }
	static FString SlotFilePath(bool bSlotB);

	/** Load the latest VALID checkpoint, or a fresh record if neither slot is valid. Never throws/crashes on bad data. */
	static FMRProgressRecord Load(FMRProgressLoadReport& OutReport);
	/** Write a new checkpoint (generation = highest seen + 1) to the alternate slot and verify it. */
	static FMRProgressSaveResult Save(const FMRProgressRecord& Record);
	/** TEST HOOK: write a SaveGame object (any SaveVersion/generation/checksum) into a slot using the real envelope format. */
	static bool WriteSlotForTest(bool bSlotB, UMRProgressSaveGame* Save);
	/** P5B-3A (additive, read-only): per-slot v1/v0 content, migrated to v1 and fully validated. A slot holding a NEWER-version file reports bNewer. */
	struct FSlotRead { bool bExists = false, bValid = false, bNewer = false, bMigrated = false; int32 Generation = -1; FMRProgressRecord Record; FString Why; };
	static FSlotRead ReadSlotV1(bool bSlotB);
	/** P5B-3A (additive, read-only): the integrity-verified SaveGame object of a slot (any version), or null. Never crashes on malformed files. */
	static UMRProgressSaveGame* ReadSlotObject(bool bSlotB, FString& Why);
	/** Delete both slots of the CURRENT base name (test cleanup; never touches other bases). */
	static void DeleteBoth();

	static int32 ComputeChecksum(int32 Generation, const FMRProgressRecord& Record);
	/** v0 -> current migration. Returns false if it cannot be used. */
	static bool Migrate(UMRProgressSaveGame* Save, TArray<FString>& Notes, bool& bMigrated);
};
