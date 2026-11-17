// Moon Racer - narrative data schemas (Phase 3B P5A). CONTENT-INDEPENDENT.
//
// These types describe HOW dialogue, NPCs and missions are represented. They contain no canonical content: every record that
// exists today is a "TEST_FIXTURE_*" record built by Dev/MRNarrativeFixtures. Player-visible text is never stored in a record:
// records carry string-table KEYS (FName) and a string-table id; text is resolved to FText at display time. Gameplay logic
// (edges, conditions, effects, events) is separate from that text, so localisation never touches logic.
//
// Records reference each other only by stable IDs (FName), never by object pointer, so a bundle can be validated as a unit.

#pragma once

#include "CoreMinimal.h"
#include "Engine/DataAsset.h"
#include "Onboarding/MROnboardingTypes.h"
#include "MRNarrativeTypes.generated.h"

/** Where narrative content is being registered. There is deliberately no implicit default at the registration API (Unspecified is rejected). */
enum class EMREnvironment : uint8 { Unspecified, Development, Production };

/** An APPROVED mapping of a one-time effect id that changed between content versions, so existing ledgers stay valid. */
struct FMREffectMigration
{
	FName From, To;            // To is None for a retirement
	bool bRetire = false;      // true: the effect was intentionally removed (approved); the old ledger entry is simply kept
	FName ApprovalId;          // required
};

namespace MRNarrative
{
	/** The environment of THIS process: Production in shipping builds (cannot be overridden), otherwise Development unless -MRNarrativeEnv=Production.
	 *  A registration request for a MORE permissive environment than this one is refused, so fixtures are unreachable in production processes. */
	MOONRACER_API EMREnvironment CurrentEnvironment();
	/** Tests only (ignored in shipping builds). Unspecified clears the override. */
	MOONRACER_API void SetEnvironmentOverrideForTest(EMREnvironment Env);

	/** Every fixture ID/record must start with this; no canonical record may. */
	inline FString FixturePrefix() { return TEXT("TEST_FIXTURE_"); }
	inline bool HasFixturePrefix(FName Id) { return Id.ToString().StartsWith(FixturePrefix(), ESearchCase::CaseSensitive); }

	/** UI chrome strings ("Continue", "Cancel", ...). NOT narrative content. */
	MOONRACER_API FName UiTableId();
	MOONRACER_API void EnsureUiStrings();
	MOONRACER_API FText UiText(const TCHAR* Key);

	/** True if the string table exists and holds the key. */
	MOONRACER_API bool HasString(FName TableId, FName Key);
	/** Resolve a key to FText. A missing table/key yields a visible "[MISSING TEXT]" marker (and is logged), never an empty string. */
	MOONRACER_API FText ResolveText(FName TableId, FName Key);
	/** (Re)register a runtime string table (unregisters any previous table with the id first: registering an id twice hard-asserts in the engine). */
	MOONRACER_API void RegisterStrings(FName TableId, const TMap<FName, FString>& Entries);
}

UENUM()
enum class EMRDialogueNodeType : uint8
{
	Line,     // a spoken line; the player presses Continue; NextNodeId
	Choice,   // a line plus player response choices (conditions hide choices)
	Branch,   // silent, automatic: the first choice whose conditions hold is taken
	End       // terminates the conversation; carries the completion event
};

UENUM()
enum class EMRConditionType : uint8
{
	FactSet,             // Subject = fact id
	FactNotSet,          // Subject = fact id
	MissionStatus,       // Subject = mission id, Status = required status
	DialogueCompleted,   // Subject = dialogue graph id
	ObjectiveCompleted   // Subject = objective id
};

UENUM()
enum class EMREffectType : uint8
{
	SetFact,           // Subject = fact id
	ClearFact,         // Subject = fact id
	OfferMission,      // Subject = mission id
	AcceptMission,     // Subject = mission id
	CompleteObjective, // Subject = objective id
	EmitEvent          // Subject = gameplay event id (may complete objectives that wait on it)
};

USTRUCT(BlueprintType)
struct MOONRACER_API FMRContentProvenance
{
	GENERATED_BODY()
	/** Where the content came from (approved document / record id). Required for every non-fixture record. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Narrative") FName SourceDocumentId;
	/** Who/what approved it. Required for every non-fixture record. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Narrative") FName ApprovalId;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Narrative") FString Note;
};

USTRUCT(BlueprintType)
struct MOONRACER_API FMRDialogueCondition
{
	GENERATED_BODY()
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Narrative") EMRConditionType Type = EMRConditionType::FactSet;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Narrative") FName Subject;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Narrative") EMRQuestStatus Status = EMRQuestStatus::Active; // MissionStatus only
};

USTRUCT(BlueprintType)
struct MOONRACER_API FMRDialogueEffect
{
	GENERATED_BODY()
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Narrative") EMREffectType Type = EMREffectType::SetFact;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Narrative") FName Subject;
	/** One-time effects fire at most once per save, however often the conversation is replayed or interrupted. Requires EffectId. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Narrative") bool bOneTime = false;
	/** Stable, bundle-unique id used by the one-time ledger. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Narrative") FName EffectId;
};

USTRUCT(BlueprintType)
struct MOONRACER_API FMRDialogueChoice
{
	GENERATED_BODY()
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Narrative") FName ChoiceId;
	/** String-table key of the player-visible response (Choice nodes). Unused by Branch nodes. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Narrative") FName TextKey;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Narrative") FName NextNodeId;
	/** All must hold for the choice to be offered/taken. Empty = unconditional. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Narrative") TArray<FMRDialogueCondition> Conditions;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Narrative") TArray<FMRDialogueEffect> Effects;
};

USTRUCT(BlueprintType)
struct MOONRACER_API FMRDialogueNode
{
	GENERATED_BODY()
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Narrative") FName NodeId;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Narrative") EMRDialogueNodeType Type = EMRDialogueNodeType::Line;
	/** NPC id of the speaker; None = the player. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Narrative") FName SpeakerNpcId;
	/** String-table key of the spoken text (Line/Choice nodes). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Narrative") FName TextKey;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Narrative") FName NextNodeId;                       // Line
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Narrative") TArray<FMRDialogueChoice> Choices;     // Choice, Branch
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Narrative") TArray<FMRDialogueEffect> OnEnterEffects;
	/** End nodes only: reported to the caller when the conversation completes (the hook onboarding/missions listen to). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Narrative") FName CompletionEventId;
};

USTRUCT(BlueprintType)
struct MOONRACER_API FMRObjectiveDef
{
	GENERATED_BODY()
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Narrative") FName ObjectiveId;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Narrative") FName TextKey;
	/** Gameplay event id that completes this objective (see UMRNarrativeSubsystem::NotifyGameEvent). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Narrative") FName CompletionEventId;
};

/** Common header of every narrative record. */
UCLASS(Abstract, BlueprintType)
class MOONRACER_API UMRNarrativeRecordBase : public UPrimaryDataAsset
{
	GENERATED_BODY()
public:
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Narrative") FName RecordId;
	/** Version of the content set this record belongs to. All graphs+NPCs in a bundle share one; all missions share one. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Narrative") FName ContentVersion;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Narrative") FMRContentProvenance Provenance;
	/** TEST FIXTURE - NONCANON. Fixture records may never be reachable from canonical records or a production bundle. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Narrative") bool bTestFixture = false;
	/** Hash of this record's canonical source (set by the importer; empty for records built in code). Used to detect changes without a version bump. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Narrative") FString SourceRecordHash;
};

UCLASS(BlueprintType)
class MOONRACER_API UMRNpcRecord : public UMRNarrativeRecordBase
{
	GENERATED_BODY()
public:
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Narrative") FName StringTableId;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Narrative") FName DisplayNameKey;
	/** Graph started when the player interacts with this NPC. None = the NPC has no conversation. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Narrative") FName DefaultDialogueGraphId;
	/** Optional fact that must be set for the NPC to be interactable. None = always available. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Narrative") FName AvailabilityFact;
};

UCLASS(BlueprintType)
class MOONRACER_API UMRDialogueGraph : public UMRNarrativeRecordBase
{
	GENERATED_BODY()
public:
	/** The NPC this conversation belongs to. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Narrative") FName NpcId;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Narrative") FName StringTableId;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Narrative") FName StartNodeId;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Narrative") TArray<FMRDialogueNode> Nodes;

	const FMRDialogueNode* FindNode(FName NodeId) const;
};

UCLASS(BlueprintType)
class MOONRACER_API UMRMissionRecord : public UMRNarrativeRecordBase
{
	GENERATED_BODY()
public:
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Narrative") FName StringTableId;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Narrative") FName TitleKey;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Narrative") FName SummaryKey;
	/** NPC that offers the mission. None = offered by an effect/system. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Narrative") FName OfferingNpcId;
	/** Sequential: the next objective becomes active when the previous one completes. NOTE: no reward fields exist by design (not approved). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Narrative") TArray<FMRObjectiveDef> Objectives;
};

/** A localisation table produced by the importer: logical table id + locale + key->source text. Registered as a runtime FStringTable by MRNarrative::RegisterStrings. */
UCLASS(BlueprintType)
class MOONRACER_API UMRNarrativeStringTable : public UDataAsset
{
	GENERATED_BODY()
public:
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Narrative") FName TableId;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Narrative") FString Locale = TEXT("en");
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Narrative") TMap<FName, FString> Entries;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Narrative") bool bTestFixture = false;
};

/** A set of records validated and registered together. */
USTRUCT()
struct MOONRACER_API FMRNarrativeBundle
{
	GENERATED_BODY()
	UPROPERTY() TArray<TObjectPtr<UMRNpcRecord>> Npcs;
	UPROPERTY() TArray<TObjectPtr<UMRDialogueGraph>> Graphs;
	UPROPERTY() TArray<TObjectPtr<UMRMissionRecord>> Missions;
};
