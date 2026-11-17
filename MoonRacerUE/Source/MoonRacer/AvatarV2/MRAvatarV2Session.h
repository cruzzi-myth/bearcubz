// Moon Racer - Avatar Creator V2 session model (AV2 I1+I2). UI-independent: the stage/category structure, the capability
// matrix (what is genuinely functional vs unavailable, with reasons), the functional edits (species id, development body,
// rigid accessory attachments, material variant) and dev-slot save/load. Every edit goes through the existing
// UMRAvatarCustomizationComponent, so a change is only reported as applied when the mesh/material/component actually responded.
//
// House Crest here is a NONCANON PLACEHOLDER held in session memory only. It is not saved, not tied to factions or gameplay.

#pragma once

#include "CoreMinimal.h"
#include "UObject/Object.h"
#include "Avatar/MRAvatarTypes.h"
#include "MRAvatarV2Session.generated.h"

class AMRPlayerCharacter;
class UMRAvatarCatalog;
class UMRAvatarCustomizationComponent;
class UMRAvatarSaveSubsystem;

enum class EMRV2Support : uint8 { Functional, Partial, Unavailable };
enum class EMRV2OptionKind : uint8 { Species, Body, Accessory, Material, Crest };

struct MOONRACER_API FMRV2Stage { int32 Number; FName Id; FString Name; };
struct MOONRACER_API FMRV2Category { int32 Number; FName Id; FString Name; int32 Stage; };

struct MOONRACER_API FMRV2Capability
{
	EMRV2Support Support = EMRV2Support::Unavailable;
	FString Summary;
	/** Controls that are NOT offered, each "<control> - <reason>". Shown as text; never as a fake working control. */
	TArray<FString> Unavailable;
};

struct MOONRACER_API FMRV2Option
{
	FName Id;
	FString Label;
	FString Note;       // honest qualifier (e.g. "development placeholder", "id only - shared body")
	bool bSelected = false;
	bool bDevPlaceholder = false;
};

struct MOONRACER_API FMRV2Result
{
	bool bOk = false;
	FString Message;
};

UCLASS()
class MOONRACER_API UMRAvatarV2Session : public UObject
{
	GENERATED_BODY()

public:

	static const TArray<FMRV2Stage>& Stages();
	static const TArray<FMRV2Category>& Categories();
	static TArray<int32> CategoriesOfStage(int32 StageNumber);

	/** Bind to the character being previewed. Loads the dev-slot save (or the catalog default) onto it. False if unusable. */
	bool Initialize(AMRPlayerCharacter* InTarget, FString& OutError);

	FMRV2Capability Capability(int32 CategoryNumber) const;
	TArray<FMRV2Option> Options(EMRV2OptionKind Kind) const;

	// --- functional edits (all-or-nothing through the component; Working is unchanged on failure) ---
	FMRV2Result SetSpecies(FName Id);
	FMRV2Result SetBody(FName Id);
	FMRV2Result ToggleAccessory(FName Id);
	FMRV2Result SetMaterialVariant(FName Id);
	FMRV2Result ResetAppearance();
	/** Re-apply the last committed (saved or loaded) appearance. */
	FMRV2Result RevertToCommitted();

	// --- dev-slot persistence (refuses the protected default slot) ---
	FMRV2Result SaveToDevSlot();
	FMRV2Result LoadFromDevSlot();
	FString SlotName() const;

	// --- House Crest: NONCANON placeholders, session memory only ---
	static const TArray<FName>& PlaceholderCrestIds();
	FMRV2Result SelectCrest(FName Id);
	/** Dev: forget the crest choice and unlock it (the real unlock path is future, checkpoint-based, and does not exist). */
	void ResetCrestForDev();
	FName OriginalCrestId() const { return OriginalCrest; }
	FName ActiveCrestId() const { return ActiveCrest; }
	bool IsCrestLocked() const { return bCrestLocked; }
	/** Always false: no progression checkpoints are approved, so no post-creation House Crest change is possible. */
	static bool AreCrestChangesAvailable() { return false; }

	const FMRAvatarAppearance& Working() const;
	const FString& LastStatus() const { return Status; }
	UMRAvatarCatalog* Catalog() const { return CatalogPtr; }
	bool HasPawn() const { return Target != nullptr; }
	/** Test hook: use a catalog without a bound character (structure/capability/option tests). */
	void SetCatalogForTest(UMRAvatarCatalog* C) { CatalogPtr = C; }

private:

	UMRAvatarCustomizationComponent* Comp() const;
	FMRV2Result Try(const FMRAvatarAppearance& Candidate, const FString& OkMessage);
	UMRAvatarSaveSubsystem* SaveSys() const;

	UPROPERTY(Transient) TObjectPtr<AMRPlayerCharacter> Target;
	UPROPERTY(Transient) TObjectPtr<UMRAvatarCatalog> CatalogPtr;

	FName OriginalCrest, ActiveCrest;
	bool bCrestLocked = false;
	FString Status;
};
