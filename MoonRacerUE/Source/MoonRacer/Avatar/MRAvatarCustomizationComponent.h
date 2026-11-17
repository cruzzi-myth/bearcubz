// Moon Racer - avatar customization component (Phase 3A.3).
// Applies an FMRAvatarAppearance to its AMRPlayerCharacter using the existing body switching, rigid attachment points
// and material functions. An appearance is applied all-or-nothing: if anything fails the previous state is restored.
// Deformable (skinned) clothing is NOT supported: no compatible skinned garment has been tested.

#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "Avatar/MRAvatarTypes.h"
#include "MRAvatarCustomizationComponent.generated.h"

class AMRPlayerCharacter;
class UMRAvatarCatalog;

USTRUCT(BlueprintType)
struct MOONRACER_API FMRAvatarApplyResult
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly, Category="MR|Avatar") bool bApplied = false;
	UPROPERTY(BlueprintReadOnly, Category="MR|Avatar") FString Message;
	UPROPERTY(BlueprintReadOnly, Category="MR|Avatar") FMRAvatarValidationResult Validation;
	/** Pending slots that were stored but not applied because they have no 3D asset. */
	UPROPERTY(BlueprintReadOnly, Category="MR|Avatar") TArray<FName> SkippedPending;
};

UCLASS(ClassGroup=(MoonRacer), meta=(BlueprintSpawnableComponent))
class MOONRACER_API UMRAvatarCustomizationComponent : public UActorComponent
{
	GENERATED_BODY()

public:

	UMRAvatarCustomizationComponent();

	/** Catalog override (tests). If null the default catalog asset is loaded. */
	void SetCatalogOverride(UMRAvatarCatalog* Catalog) { CatalogOverride = Catalog; }
	UMRAvatarCatalog* GetCatalog();

	/** Apply (preview) an appearance. All-or-nothing; the committed appearance is not changed. */
	UFUNCTION(BlueprintCallable, Category="MR|Avatar")
	FMRAvatarApplyResult PreviewAppearance(const FMRAvatarAppearance& Appearance);

	/** Make the currently previewed appearance the committed one (Confirm). Does not save. */
	UFUNCTION(BlueprintCallable, Category="MR|Avatar")
	void CommitCurrent();

	/** Re-apply the committed appearance (Cancel). */
	UFUNCTION(BlueprintCallable, Category="MR|Avatar")
	FMRAvatarApplyResult RevertToCommitted();

	/** Apply the catalog default (Reset). Does not commit. */
	UFUNCTION(BlueprintCallable, Category="MR|Avatar")
	FMRAvatarApplyResult ResetToDefault();

	/** Load the locally saved appearance (migrated + sanitised) and apply+commit it, falling back to the default. */
	UFUNCTION(BlueprintCallable, Category="MR|Avatar")
	FMRAvatarApplyResult LoadAndApplySaved();

	UFUNCTION(BlueprintPure, Category="MR|Avatar") const FMRAvatarAppearance& GetCurrentAppearance() const { return Current; }
	UFUNCTION(BlueprintPure, Category="MR|Avatar") const FMRAvatarAppearance& GetCommittedAppearance() const { return Committed; }
	bool HasApplied() const { return bHasApplied; }

protected:

	virtual void BeginPlay() override;

private:

	AMRPlayerCharacter* GetPlayerCharacter() const;
	/** Applies without rollback handling. Returns an empty string on success, else the failure reason. */
	FString ApplyUnchecked(const FMRAvatarAppearance& Appearance, UMRAvatarCatalog* Catalog);

	UPROPERTY(Transient) TObjectPtr<UMRAvatarCatalog> CatalogOverride;
	UPROPERTY(Transient) TObjectPtr<UMRAvatarCatalog> CachedCatalog;

	FMRAvatarAppearance Current;
	FMRAvatarAppearance Committed;
	bool bHasApplied = false;
};
