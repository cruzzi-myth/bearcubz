// Moon Racer - checkpoint v2 PERSISTENCE (Phase 3B P5B-3A). Prepared infrastructure: NOT wired into the live onboarding flow, which still uses
// FMRProgressStore (v1). Uses the SAME A/B slot files and "MRPG" envelope as v1:
//   * Load is strictly READ-ONLY: a v1 checkpoint is migrated in memory; nothing is written and no backup is made.
//   * Save writes the alternate slot (temp file + atomic replace + read-back verification). Before the FIRST v2 write, every existing non-v2 slot file
//     (v1/v0/corrupt) is copied to a NON-OVERWRITING backup <slot>.sav.v1.bak (numbered when contents differ); later writes back up only a non-v2 file they are about to replace.
//   * Newer-than-supported slot files are never loaded and never overwritten. A v1 reader sees a v2 file as a newer version, so it can never overwrite it either.
//   * Refuses the default player slot until the v2 flow is activated.

#pragma once

#include "CoreMinimal.h"
#include "Onboarding/MRCheckpointV2.h"

class UMRAvatarSaveSubsystem;

struct FMRV2LoadReport
{
	bool bExistsA = false, bExistsB = false, bValidA = false, bValidB = false, bNewerA = false, bNewerB = false;
	int32 VersionA = -1, VersionB = -1, GenerationA = -1, GenerationB = -1;
	FString ChosenSlot;                  // "A", "B", or empty
	int32 ChosenGeneration = -1;
	int32 SourceVersion = 0;             // 0 = none (fresh), 1 = migrated from v1/v0, 2 = native v2
	bool bMigrated = false;              // a v1 checkpoint was migrated IN MEMORY
	bool bFallbackFresh = false;
	bool bRejectedNewerVersion = false;
	FMRMigrationResult Migration;        // valid when bMigrated
	bool bMixedConflict = false;         // P5B-3B: valid v1 slot with a HIGHER generation than the (chosen) valid v2 slot; both preserved
	FMRMigrationResult AlternateMigration; // the other (v1) slot of a mixed pair, migrated in memory for reporting only
	TArray<FString> Notes;
};

struct FMRV2SaveResult
{
	bool bOk = false;
	FString Slot;
	int32 Generation = -1;
	FString Error;
	TArray<FString> BackupsCreated;      // backup files created by THIS save
};

class MOONRACER_API FMRCheckpointV2Store
{
public:
	/** Newest valid checkpoint (v2 or migrated v1/v0), or a fresh v2 record. NEVER writes anything. */
	static FMRCheckpointV2 Load(const FMRMigrationContext& Ctx, FMRV2LoadReport& OutReport);
	/** Persist a v2 checkpoint to the alternate slot (see the header comment). */
	static FMRV2SaveResult Save(const FMRCheckpointV2& Record);

	static FString BackupPath(bool bSlotB, int32 N);   // N = 0 -> <slot>.sav.v1.bak ; N >= 1 -> <slot>.sav.v1.<N>.bak
	static TArray<FString> ListBackups(bool bSlotB);

	/** Read-only evidence gathering from the REAL saves (avatar subsystem + narrative store). Never writes. */
	static FMRSaveEvidence GatherSaveEvidence(UMRAvatarSaveSubsystem* Avatar, const FMRMigrationMap& Map);

	/** TEST HOOKS: simulate a failure at a point in Save. */
	enum class EFailPoint : uint8 { None, AfterBackup, AfterTempWrite, TornTargetWrite };
	static EFailPoint GFailPoint;
	/** TEST HOOK: write a v2 file with a chosen generation and a correct envelope/checksum into a slot. */
	static bool WriteSlotV2ForTest(bool bSlotB, int32 Generation, const FMRCheckpointV2& Record);
	static FString DefaultSlotBase() { return TEXT("MRProgress_Local"); }
};
