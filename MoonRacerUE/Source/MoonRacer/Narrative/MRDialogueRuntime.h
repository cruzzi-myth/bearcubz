// Moon Racer - deterministic dialogue runtime (Phase 3B P5A). Headless: a UI (or a test) drives it with Continue/Choose/Cancel.
//
// One conversation at a time. Traversal is a pure function of (graph, narrative state, the player's inputs): no randomness, no timers.
//  * Line   : shows text, waits for Continue.        * Choice : shows text + the choices whose conditions hold, waits for Choose.
//  * Branch : silent; takes the first choice whose conditions hold.   * End : completes the conversation.
// Node OnEnter effects and choice effects are applied through the narrative subsystem; one-time effects are ledgered there, so
// replaying or restarting a conversation can never fire them twice (D-7: an interrupted conversation restarts from its first node).

#pragma once

#include "CoreMinimal.h"
#include "UObject/Object.h"
#include "Onboarding/MRIntegrationInterfaces.h"
#include "Narrative/MRNarrativeTypes.h"
#include "MRDialogueRuntime.generated.h"

class UMRNarrativeSubsystem;

enum class EMRDialogueFinish : uint8 { Completed, Cancelled, Failed };

struct FMRDialogueChoiceView { FName ChoiceId; FText Text; };

struct FMRDialogueView
{
	bool bActive = false;
	FName GraphId, NodeId, SpeakerNpcId;
	FText Speaker, Text;
	TArray<FMRDialogueChoiceView> Choices;   // non-empty on Choice nodes
	bool bCanContinue = false;               // true on Line nodes
};

struct FMRDialogueResult
{
	EMRDialogueFinish Finish = EMRDialogueFinish::Failed;
	FName GraphId, EndNodeId, CompletionEventId;
	bool bFirstCompletion = false;   // first time this graph completed in this save
	FString Why;
};

DECLARE_MULTICAST_DELEGATE(FMROnDialogueView);
DECLARE_MULTICAST_DELEGATE_OneParam(FMROnDialogueFinished, const FMRDialogueResult&);

UCLASS()
class MOONRACER_API UMRDialogueRuntime : public UObject, public IMRDialogueService
{
	GENERATED_BODY()
public:
	void Init(UMRNarrativeSubsystem* InOwner) { Owner = InOwner; }

	/** Begin a conversation from its start node. Returns false (with Why) if one is already active or the graph is unknown/invalid. */
	bool Start(FName GraphId, TFunction<void(const FMRDialogueResult&)> Done = nullptr, FString* Why = nullptr);
	bool Continue();
	bool Choose(FName ChoiceId);
	bool ChooseIndex(int32 Index);
	void Cancel(const FString& Reason = TEXT("cancelled"));

	bool IsActive() const { return View.bActive; }
	const FMRDialogueView& GetView() const { return View; }
	/** Total conversations finished/cancelled/failed (tests). */
	int32 NumCompleted = 0, NumCancelled = 0, NumFailed = 0;

	FMROnDialogueView OnViewChanged;
	FMROnDialogueFinished OnFinished;

	// ---- IMRDialogueService ----
	virtual bool IsDialogueAvailable(FName GraphId) override;
	virtual void RunDialogue(FName GraphId, TFunction<void(EMRServiceResult, FName EndNodeId)> Done) override;
	virtual void CancelDialogue() override { Cancel(TEXT("cancelled by caller")); }
	virtual bool IsDialogueActive() const override { return View.bActive; }

private:
	void Enter(FName NodeId);
	void FinishWith(EMRDialogueFinish How, FName EndNodeId, FName CompletionEvent, const FString& Why);
	void BuildSpeaker(const struct FMRDialogueNode& N);

	UPROPERTY(Transient) TObjectPtr<UMRNarrativeSubsystem> Owner;
	const UMRDialogueGraph* Graph = nullptr;   // owned by the registry (the registry cancels any conversation before it changes)
	FMRDialogueView View;
	TFunction<void(const FMRDialogueResult&)> DoneCb;
};
