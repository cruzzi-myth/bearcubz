// Moon Racer - narrative content importer (Phase 3B P5B-0). CONTENT-INDEPENDENT.
//
// Source of truth: reviewable JSON files in a bundle directory (see Docs/Phase3B_P5B0_Content_Pipeline.md), kept under version control
// outside Unreal. The importer
//   1. READS the source (never writes to it),
//   2. STAGES it in memory, strictly schema-checked, and validates the whole bundle (the P5A validator + import rules) with the
//      bundle's own staged strings,
//   3. only if there are NO errors, writes immutable, content-addressed assets and then flips a small ACTIVE receipt atomically.
// Nothing is registered with the narrative subsystem or the onboarding flow: publishing an imported bundle is a separate, explicit act.
// Importing identical source twice is a no-op ("Unchanged"). A failed/interrupted import never disturbs the previously ACTIVE bundle.

#pragma once

#include "CoreMinimal.h"
#include "Commandlets/Commandlet.h"
#include "Narrative/MRNarrativeTypes.h"
#include "Narrative/MRNarrativeValidator.h"
#include "UObject/StrongObjectPtr.h"
#include "MRNarrativeImporter.generated.h"

enum class EMRBundleClass : uint8 { Fixture, Production };
enum class EMRImportOutcome : uint8
{
	Rejected,        // source invalid: nothing was written
	ValidatedOnly,  // valid; commit was not requested
	Imported,        // new/changed content written and made ACTIVE
	Unchanged,       // identical content already ACTIVE: nothing written
	Failed           // valid source, but writing was interrupted/failed: previous ACTIVE bundle untouched
};

struct FMRImportApproval { FString ApprovalId, ApprovedBy, ApprovedOn, SourceDocumentId; };

/** A fully parsed and validated bundle held in memory only. */
struct MOONRACER_API FMRStagedBundle
{
	FString BundleId, SourceDir;
	EMRBundleClass Classification = EMRBundleClass::Fixture;
	FName DialogueVersion, QuestVersion;
	FMRImportApproval Approval;
	FString BundleHash;                                 // canonical (whitespace/key-order independent) hash of all source
	TMap<FString, FString> RecordHashes;                // "npc:ID" / "dialogue:ID" / "mission:ID" / "strings:TABLE" -> hash
	TSet<FName> EffectIds;                              // one-time effect ids present in the bundle
	TArray<FMREffectMigration> Migrations;              // approved one-time effect id migrations declared by the manifest
	TMap<FName, TMap<FName, FString>> Strings;          // staged string tables
	FMRNarrativeBundle Bundle;
	TArray<TStrongObjectPtr<UObject>> Keep;             // keeps the staged transient records alive
};

struct FMRImportOptions
{
	FString SourceDir;                                  // absolute path of the bundle directory (contains bundle.json)
	FString OutputRoot = TEXT("/Game/MoonRacer/Narrative/Generated");   // long package path
	bool bCommit = true;                                // false = validate only
	bool bForceProductionPolicy = false;                // validate as production even if the bundle says it is a fixture
};

struct FMRImportReport
{
	EMRImportOutcome Outcome = EMRImportOutcome::Rejected;
	FString BundleId, BundleHash, ActiveFolder;
	FMRValidationReport Validation;
	TArray<FString> Impact;            // what changed vs the previously ACTIVE bundle, and what it means for existing saves
	TArray<FString> GeneratedAssets;   // long package names written by THIS import
	FString Message;
	bool Ok() const { return Outcome == EMRImportOutcome::Imported || Outcome == EMRImportOutcome::Unchanged || Outcome == EMRImportOutcome::ValidatedOnly; }
	FString Summary() const;
};

struct FMRActiveReceipt
{
	bool bValid = false;
	FString BundleId, BundleHash, Classification, DialogueVersion, QuestVersion;
	TMap<FString, FString> Records;
	TArray<FString> EffectIds, Assets;
	TArray<FMREffectMigration> Migrations;
};

/** A bundle loaded from ONE generated folder, with nothing registered yet (strings stay staged). */
struct MOONRACER_API FMRLoadedBundle
{
	FMRActiveReceipt Meta;                              // the folder's self-describing metadata (COMPLETE.json)
	FMRNarrativeBundle Bundle;
	TMap<FName, TMap<FName, FString>> Strings;
};

class MOONRACER_API FMRNarrativeImporter
{
public:
	/** Parse + validate only (no files written). */
	static bool Stage(const FMRImportOptions& Opt, FMRStagedBundle& Out, FMRValidationReport& Report);
	/** Stage, validate and (optionally) commit. */
	static FMRImportReport Import(const FMRImportOptions& Opt);

	/** Read the ACTIVE receipt of a bundle (no assets loaded). */
	static FMRActiveReceipt ReadActive(const FString& OutputRoot, const FString& BundleId);
	/** Read the metadata of one generated folder (<hash12>/COMPLETE.json); invalid if the folder is incomplete or in an older format. */
	static FMRActiveReceipt ReadFolderMeta(const FString& OutputRoot, const FString& BundleId, const FString& Hash12);
	/** Load ONE generated folder (not necessarily the active one) and verify every record against the folder's metadata. Registers NOTHING. */
	static bool LoadFolder(const FString& OutputRoot, const FString& BundleId, const FString& Hash12, FMRLoadedBundle& Out, FMRValidationReport& Report);
	/** Load the ACTIVE bundle's assets into a bundle ready for UMRNarrativeSubsystem::RegisterBundle (which is NOT called). Registers its string tables. */
	static bool LoadActive(const FString& OutputRoot, const FString& BundleId, FMRNarrativeBundle& Out, FMRValidationReport& Report, bool bProductionOnly);

	/** Absolute folder of a bundle under an output root. */
	static FString BundleDir(const FString& OutputRoot, const FString& BundleId);
	/** SHA1 (hex) of raw file bytes - what the manifest's "sha1" fields hold. */
	static FString Sha1OfFile(const FString& Path);
	static bool IsValidId(const FString& Id);

	/** TEST HOOK: fail the commit after N assets have been written (-1 = off). */
	static int32 GFailAfterAssets;
};

UCLASS()
class MOONRACER_API UMRNarrativeImportCommandlet : public UCommandlet
{
	GENERATED_BODY()
public:
	/** UnrealEditor-Cmd MoonRacer.uproject -run=MRNarrativeImport -Source=<dir> [-Out=/Game/...] [-ValidateOnly] [-Production] */
	virtual int32 Main(const FString& Params) override;
};
