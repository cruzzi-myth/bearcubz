// Moon Racer - minimal narrative HUD (UMG, built in C++) (Phase 3B P5A): interaction prompt, objective tracker, dialogue panel.
// Shows only what the runtime/registry give it (speaker name, text, responses, Continue, Cancel). No hard-coded narrative text.
// Keyboard: Up/Down (W/S) select, Enter/Space confirm or Continue, 1-9 pick a response, Esc cancels. Mouse: click the buttons.

#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"
#include "Components/Button.h"
#include "MRNarrativeHud.generated.h"

class UBorder; class UTextBlock; class UVerticalBox; class UHorizontalBox;
class UMRInteractorComponent; class UMRNarrativeSubsystem; class UMRInteractableComponent;

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FMRNarrativeAction, FName, Action, int32, Param);

UCLASS()
class MOONRACER_API UMRNarrativeButton : public UButton
{
	GENERATED_BODY()
public:
	UPROPERTY() FName ActionName;
	UPROPERTY() int32 ParamIndex = 0;
	UPROPERTY() FMRNarrativeAction OnAction;
	void Init(FName InAction, int32 InParam) { ActionName = InAction; ParamIndex = InParam; OnClicked.AddUniqueDynamic(this, &UMRNarrativeButton::HandleClicked); }
private:
	UFUNCTION() void HandleClicked() { OnAction.Broadcast(ActionName, ParamIndex); }
};

UCLASS()
class MOONRACER_API UMRNarrativeHudWidget : public UUserWidget
{
	GENERATED_BODY()
public:
	virtual bool Initialize() override;
	virtual void NativeDestruct() override;
	virtual FReply NativeOnKeyDown(const FGeometry& Geo, const FKeyEvent& KeyEvent) override;

	/** Follow an interactor's focus (prompt). Subsystem delegates (objectives, dialogue) are bound automatically. */
	void BindInteractor(UMRInteractorComponent* Interactor);

	/** Same code path as a click / key press (tests). */
	UFUNCTION() void HandleAction(FName Action, int32 Param);
	bool HandleKey(const FKey& Key);

	// ---- read-back for tests ----
	bool IsDialoguePanelVisible() const;
	bool IsPromptVisible() const;
	FString GetSpeakerString() const;
	FString GetDialogueString() const;
	FString GetPromptString() const;
	FString GetTrackerString() const;
	bool IsTrackerVisible() const;
	int32 NumChoiceButtons() const { return ChoiceButtons.Num(); }
	FString GetChoiceString(int32 I) const;
	bool IsContinueVisible() const;
	int32 GetSelectedIndex() const { return Selected; }
	/** Screen position of a button (for real-mouse tests). */
	bool GetChoiceButtonCenter(int32 I, FVector2D& OutAbs) const;

private:
	void RefreshDialogue();
	void RefreshTracker();
	void RefreshPrompt(UMRInteractableComponent* Focus);
	UMRNarrativeSubsystem* Narrative() const;
	void SetGameplayInputBlocked(bool bBlocked);
	UMRNarrativeButton* MakeButton(UVerticalBox* Parent, UHorizontalBox* HParent, const FText& Label, FName Action, int32 Param, UTextBlock*& OutText);

	UPROPERTY() TObjectPtr<UBorder> PromptBox;
	UPROPERTY() TObjectPtr<UTextBlock> PromptText;
	UPROPERTY() TObjectPtr<UBorder> TrackerBox;
	UPROPERTY() TObjectPtr<UTextBlock> TrackerTitle;
	UPROPERTY() TObjectPtr<UTextBlock> TrackerObjective;
	UPROPERTY() TObjectPtr<UBorder> DialogueBox;
	UPROPERTY() TObjectPtr<UTextBlock> SpeakerText;
	UPROPERTY() TObjectPtr<UTextBlock> BodyText;
	UPROPERTY() TObjectPtr<UVerticalBox> ChoiceList;
	UPROPERTY() TObjectPtr<UHorizontalBox> BottomRow;
	UPROPERTY() TObjectPtr<UMRNarrativeButton> ContinueButton;
	UPROPERTY() TObjectPtr<UMRNarrativeButton> CancelButton;
	UPROPERTY() TArray<TObjectPtr<UMRNarrativeButton>> ChoiceButtons;
	UPROPERTY() TArray<TObjectPtr<UTextBlock>> ChoiceTexts;
	TWeakObjectPtr<UMRInteractorComponent> BoundInteractor;
	FDelegateHandle ViewHandle, TrackerHandle, FocusHandle;
	int32 Selected = 0;
	bool bBlockedInput = false;
};
