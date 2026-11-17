// Moon Racer - avatar catalog (Phase 3A.2). A data asset listing every option the avatar system knows about.
//
// Canonical IDs (species, hair, eyes, outfit, signal accents) are generated from the web registry by
// Scripts/Tools/export_avatar_catalog.mjs + Scripts/Editor/mr_build_avatar_catalog.py and are Pending (no 3D asset).
// "dev_*" entries are development stand-ins (Epic Manny/Quinn bodies, primitive marker props, mannequin materials);
// they are NOT canonical Moon Racer designs.

#pragma once

#include "CoreMinimal.h"
#include "Engine/DataAsset.h"
#include "Avatar/MRAvatarTypes.h"
#include "MRAvatarCatalog.generated.h"

class UMaterialInterface;
class USkeletalMesh;
class UStaticMesh;

USTRUCT(BlueprintType)
struct MOONRACER_API FMRMaterialBinding
{
	GENERATED_BODY()

	/** Body option this binding applies to. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Avatar") FName BodyId;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Avatar") int32 SlotIndex = 0;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Avatar") TSoftObjectPtr<UMaterialInterface> Material;
};

USTRUCT(BlueprintType)
struct MOONRACER_API FMRAvatarOption
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Avatar") FName Id;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Avatar") FText DisplayName;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Avatar") EMRAvatarAssetStatus Status = EMRAvatarAssetStatus::Pending;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Avatar") FString Note;

	/** Body options: the skeletal mesh (must be one of AMRPlayerCharacter::DevBodyMeshes and share the humanoid skeleton). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Avatar|Body") TSoftObjectPtr<USkeletalMesh> BodyMesh;

	/** Accessory options: the rigid attachment point (see DA_MR_HumanoidAttachmentPoints), mesh and scale. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Avatar|Accessory") FName AttachmentPointId;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Avatar|Accessory") TSoftObjectPtr<UStaticMesh> AccessoryMesh;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Avatar|Accessory") FVector AccessoryScale = FVector(0.1f);
	/** Dev-only tint for primitive marker props so each attachment point is identifiable. White = untinted. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Avatar|Accessory") FLinearColor DevTint = FLinearColor::White;

	/** Material variant options: per-body material overrides. Empty = "no override" (the mesh's own materials). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Avatar|Material") TArray<FMRMaterialBinding> MaterialBindings;

	bool IsAvailable() const { return Status != EMRAvatarAssetStatus::Pending; }
};

USTRUCT(BlueprintType)
struct MOONRACER_API FMRSpeciesEntry
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Avatar") FName Id;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Avatar") FText DisplayName;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Avatar") EMRSpeciesAssessment Assessment = EMRSpeciesAssessment::Unassessed;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Avatar") FString Note;
};

UCLASS(BlueprintType)
class MOONRACER_API UMRAvatarCatalog : public UPrimaryDataAsset
{
	GENERATED_BODY()

public:

	/** Default asset location of the catalog. */
	static const TCHAR* DefaultAssetPath() { return TEXT("/Game/MoonRacer/Avatar/DA_MR_AvatarCatalog.DA_MR_AvatarCatalog"); }
	static UMRAvatarCatalog* LoadDefault();

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Avatar") TArray<FMRSpeciesEntry> Species;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Avatar") TArray<FMRAvatarOption> Bodies;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Avatar") TArray<FMRAvatarOption> Hair;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Avatar") TArray<FMRAvatarOption> Eyes;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Avatar") TArray<FMRAvatarOption> Outfits;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Avatar") TArray<FMRAvatarOption> Accessories;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Avatar") TArray<FMRAvatarOption> SignalAccents;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Avatar") TArray<FMRAvatarOption> MaterialVariants;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Avatar|Defaults") FName DefaultSpeciesId;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Avatar|Defaults") FName DefaultBodyId;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Avatar|Defaults") FName DefaultMaterialVariantId;

	const FMRSpeciesEntry* FindSpecies(FName Id) const;
	const FMRAvatarOption* FindBody(FName Id) const { return FindIn(Bodies, Id); }
	const FMRAvatarOption* FindAccessory(FName Id) const { return FindIn(Accessories, Id); }
	const FMRAvatarOption* FindMaterialVariant(FName Id) const { return FindIn(MaterialVariants, Id); }
	static const FMRAvatarOption* FindIn(const TArray<FMRAvatarOption>& List, FName Id);

	/** Validate an appearance: unknown IDs and invalid combinations are Errors; Pending-asset IDs are Pending issues. */
	FMRAvatarValidationResult Validate(const FMRAvatarAppearance& A) const;

	/** The appearance used for a fresh avatar and for "Reset". */
	FMRAvatarAppearance MakeDefaultAppearance() const;

	/**
	 * Replace unknown/obsolete/unsupported IDs with defaults (or drop them) so a saved appearance from an older catalog still loads.
	 * Known Pending IDs are kept. Returns true if anything changed; Notes describes each change.
	 */
	bool Sanitize(FMRAvatarAppearance& A, TArray<FString>& Notes) const;
};
