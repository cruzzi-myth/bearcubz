// Moon Racer - avatar appearance data (Phase 3A.2).
//
// FMRAvatarAppearance is the versioned, cosmetic-only description of an avatar. It holds IDs, never meshes.
// IDs come from the canonical registry (network-app/src, exported by Scripts/Tools/export_avatar_catalog.mjs)
// or - for dev stand-ins that have no canonical ID - from clearly-marked "dev_*" catalog entries.
// It deliberately has NO Passport / Supabase / credential fields: local avatar data is separate from production.

#pragma once

#include "CoreMinimal.h"
#include "MRAvatarTypes.generated.h"

namespace MRAvatar
{
	/** Current appearance schema version. Bump when FMRAvatarAppearance changes and add a migration step. */
	constexpr int32 CurrentSchemaVersion = 1;

	/** The six permanent canonical species IDs (see network-app/src/types/player.ts AVATAR_SPECIES). */
	MOONRACER_API const TArray<FName>& CanonicalSpeciesIds();
	MOONRACER_API bool IsCanonicalSpecies(FName SpeciesId);
}

UENUM(BlueprintType)
enum class EMRAvatarAssetStatus : uint8
{
	/** Canonical ID exists but there is no usable 3D asset yet. Never applied, never shown as selectable. */
	Pending,
	/** Works, but is a development stand-in (Epic Manny/Quinn, primitive marker props). Not a canonical design. */
	DevPlaceholder,
	/** Approved production asset. */
	Approved
};

UENUM(BlueprintType)
enum class EMRSpeciesAssessment : uint8
{
	/** No 3D model has been assessed for this species. All six species are Unassessed today. */
	Unassessed,
	DevPlaceholderOnly,
	Approved
};

UENUM(BlueprintType)
enum class EMRAvatarIssueSeverity : uint8
{
	/** Invalid: unknown ID, bad combination, unsupported schema. The appearance is rejected. */
	Error,
	/** Known canonical ID with no 3D asset yet. Allowed to be stored, but not applied. */
	Pending,
	/** Informational (e.g. dev placeholder in use, species model pending). */
	Info
};

UENUM(BlueprintType)
enum class EMRAvatarSlot : uint8
{
	Schema, Species, BodyBase, Hair, Eyes, Outfit, Accessory, SignalAccent, MaterialVariant
};

USTRUCT(BlueprintType)
struct MOONRACER_API FMRAvatarIssue
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly, Category="MR|Avatar") EMRAvatarSlot Slot = EMRAvatarSlot::Schema;
	UPROPERTY(BlueprintReadOnly, Category="MR|Avatar") EMRAvatarIssueSeverity Severity = EMRAvatarIssueSeverity::Error;
	UPROPERTY(BlueprintReadOnly, Category="MR|Avatar") FName Id;
	UPROPERTY(BlueprintReadOnly, Category="MR|Avatar") FString Message;
};

USTRUCT(BlueprintType)
struct MOONRACER_API FMRAvatarValidationResult
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly, Category="MR|Avatar") TArray<FMRAvatarIssue> Issues;

	/** True when there are no Error issues (Pending/Info issues do not invalidate). */
	bool IsValid() const;
	bool HasPending() const;
	int32 CountSeverity(EMRAvatarIssueSeverity Severity) const;
	void Add(EMRAvatarSlot Slot, EMRAvatarIssueSeverity Severity, FName Id, const FString& Message);
	FString ToString() const;
};

USTRUCT(BlueprintType)
struct MOONRACER_API FMRAvatarAppearance
{
	GENERATED_BODY()

	/** Appearance schema version. Used for migration. */
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category="MR|Avatar") int32 SchemaVersion = MRAvatar::CurrentSchemaVersion;
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category="MR|Avatar") FGuid AvatarId;

	/** One of the six canonical species IDs: human, hybrid, ai, alien, mythraxian, glitch. */
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category="MR|Avatar") FName SpeciesId;
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category="MR|Avatar") FName BodyBaseId;
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category="MR|Avatar") FName HairId;
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category="MR|Avatar") FName EyesId;
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category="MR|Avatar") FName OutfitId;
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category="MR|Avatar") TArray<FName> AccessoryIds;
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category="MR|Avatar") FName SignalAccentId;
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category="MR|Avatar") FName MaterialVariantId;

	/** Incremented each time the appearance is confirmed/saved. */
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category="MR|Avatar") int32 Revision = 1;

	bool operator==(const FMRAvatarAppearance& O) const;
	bool operator!=(const FMRAvatarAppearance& O) const { return !(*this == O); }

	/** Stable JSON form (schemaVersion first). */
	FString ToJsonString() const;
	/** Strict parse. Returns false with Error set for malformed JSON, missing required fields or wrong types. */
	static bool FromJsonString(const FString& Json, FMRAvatarAppearance& Out, FString& Error);
};
