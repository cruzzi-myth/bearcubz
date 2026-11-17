// Moon Racer - LOCAL avatar appearance persistence (Phase 3A.4).
//
// Local Unreal SaveGame only. It is NOT a Passport record: nothing here reads or writes Supabase, authentication
// or Passport data, and the save carries no credentials or account identifiers.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/SaveGame.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "Avatar/MRAvatarTypes.h"
#include "MRAvatarSaveGame.generated.h"

class UMRAvatarCatalog;

/** Broadcast after an avatar appearance is validated AND written (Avatar Creator completion). Additive hook for onboarding. */
DECLARE_MULTICAST_DELEGATE_OneParam(FMROnAvatarSaved, const FMRAvatarAppearance&);

namespace MRAvatarSave
{
	/** Current SaveGame format version. v0 (legacy) -> v1 migration is implemented. */
	constexpr int32 CurrentSaveVersion = 1;
}

UCLASS()
class MOONRACER_API UMRAvatarSaveGame : public USaveGame
{
	GENERATED_BODY()

public:

	UPROPERTY(SaveGame) int32 SaveVersion = MRAvatarSave::CurrentSaveVersion;
	UPROPERTY(SaveGame) FMRAvatarAppearance Appearance;

	/** v0 (legacy) format: a single capitalised species and one optional accessory. Read only by the migration. */
	UPROPERTY(SaveGame) FName LegacySpecies;
	UPROPERTY(SaveGame) FName LegacyAccessory;

	UPROPERTY(SaveGame) FString Notice = TEXT("Local development avatar save. Not a Passport record.");
};

USTRUCT(BlueprintType)
struct MOONRACER_API FMRAvatarLoadReport
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly, Category="MR|Avatar") bool bFoundSave = false;
	UPROPERTY(BlueprintReadOnly, Category="MR|Avatar") bool bMigrated = false;
	UPROPERTY(BlueprintReadOnly, Category="MR|Avatar") int32 FromVersion = 0;
	UPROPERTY(BlueprintReadOnly, Category="MR|Avatar") bool bSanitized = false;
	/** True if the save was written by a newer build than this one and was therefore NOT used. */
	UPROPERTY(BlueprintReadOnly, Category="MR|Avatar") bool bRejectedNewerVersion = false;
	/** The file was a raw engine save (written before the integrity envelope existed) and passed full structural validation. */
	UPROPERTY(BlueprintReadOnly, Category="MR|Avatar") bool bLegacyFormat = false;
	/** A file exists but was rejected as malformed/unverifiable/corrupt and was NOT loaded. It is preserved untouched on disk. */
	UPROPERTY(BlueprintReadOnly, Category="MR|Avatar") bool bRejectedMalformed = false;
	UPROPERTY(BlueprintReadOnly, Category="MR|Avatar") FString IntegrityDetail;
	UPROPERTY(BlueprintReadOnly, Category="MR|Avatar") TArray<FString> Notes;
};

UCLASS()
class MOONRACER_API UMRAvatarSaveSubsystem : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:

	virtual void Initialize(FSubsystemCollectionBase& Collection) override;

	/** Local slot used for the player's avatar. Overridable for tests (command line: -MRAvatarSlot=Name). */
	static FString GetSlotName();
	static void SetSlotNameOverride(const FString& Name);
	/** Full path of the current slot's file (Saved/SaveGames/<slot>.sav). */
	static FString SlotFilePath();

	/** Validate then save. Rejects invalid appearances (unknown IDs, bad combinations) without touching the existing save. */
	UFUNCTION(BlueprintCallable, Category="MR|Avatar")
	bool SaveAppearance(const FMRAvatarAppearance& Appearance, FString& OutError);

	/** Always returns a usable appearance: the saved one (migrated + sanitised) or the catalog default. Never crashes on bad data. */
	UFUNCTION(BlueprintCallable, Category="MR|Avatar")
	FMRAvatarAppearance LoadAppearance(FMRAvatarLoadReport& OutReport);

	FMROnAvatarSaved OnAvatarSaved;

	UFUNCTION(BlueprintCallable, Category="MR|Avatar") bool HasSavedAppearance() const;
	UFUNCTION(BlueprintCallable, Category="MR|Avatar") bool DeleteSavedAppearance();

	/** Migrate a loaded SaveGame object to the current version in place. False if it cannot be used (newer version). */
	static bool MigrateSave(UMRAvatarSaveGame* Save, FMRAvatarLoadReport& Report);

	/** Catalog used for validation (the default asset, unless a test overrides it). */
	UMRAvatarCatalog* GetCatalog();
	void SetCatalogOverride(UMRAvatarCatalog* Catalog) { CatalogOverride = Catalog; }

private:

	UPROPERTY(Transient) TObjectPtr<UMRAvatarCatalog> CatalogOverride;
	UPROPERTY(Transient) TObjectPtr<UMRAvatarCatalog> CachedCatalog;
};
