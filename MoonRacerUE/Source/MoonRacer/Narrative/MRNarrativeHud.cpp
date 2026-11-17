#include "Narrative/MRNarrativeHud.h"
#include "Narrative/MRInteraction.h"
#include "Narrative/MRNarrativeSubsystem.h"
#include "Blueprint/WidgetTree.h"
#include "Components/Border.h"
#include "Components/CanvasPanel.h"
#include "Components/CanvasPanelSlot.h"
#include "Components/HorizontalBox.h"
#include "Components/HorizontalBoxSlot.h"
#include "Components/TextBlock.h"
#include "Components/VerticalBox.h"
#include "Components/VerticalBoxSlot.h"
#include "Engine/GameInstance.h"
#include "GameFramework/PlayerController.h"
#include "Input/Events.h"
#include "MoonRacer.h"

namespace
{
	const FLinearColor PanelColor(0.02f, 0.03f, 0.06f, 0.88f);
	UTextBlock* Text(UWidgetTree* T, const FText& V, int32 Size, FLinearColor C = FLinearColor::White)
	{
		UTextBlock* B = T->ConstructWidget<UTextBlock>(UTextBlock::StaticClass());
		B->SetText(V); B->SetColorAndOpacity(FSlateColor(C)); B->SetAutoWrapText(true);
		FSlateFontInfo F = B->GetFont(); F.Size = Size; B->SetFont(F);
		return B;
	}
}

UMRNarrativeSubsystem* UMRNarrativeHudWidget::Narrative() const
{
	UWorld* W = GetWorld(); UGameInstance* GI = W ? W->GetGameInstance() : nullptr;
	return GI ? GI->GetSubsystem<UMRNarrativeSubsystem>() : nullptr;
}

UMRNarrativeButton* UMRNarrativeHudWidget::MakeButton(UVerticalBox* VParent, UHorizontalBox* HParent, const FText& Label, FName Action, int32 Param, UTextBlock*& OutText)
{
	UMRNarrativeButton* B = WidgetTree->ConstructWidget<UMRNarrativeButton>(UMRNarrativeButton::StaticClass());
	OutText = Text(WidgetTree, Label, 16);
	OutText->SetAutoWrapText(false);   // buttons size to their text; wrapping inside a button looks broken
	OutText->SetJustification(ETextJustify::Left);
	B->AddChild(OutText);
	B->Init(Action, Param);
	B->OnAction.AddDynamic(this, &UMRNarrativeHudWidget::HandleAction);
	if (VParent) { if (UVerticalBoxSlot* S = VParent->AddChildToVerticalBox(B)) S->SetPadding(FMargin(0, 3)); }
	if (HParent) { if (UHorizontalBoxSlot* S = HParent->AddChildToHorizontalBox(B)) S->SetPadding(FMargin(6, 0)); }
	return B;
}

bool UMRNarrativeHudWidget::Initialize()
{
	const bool bOk = Super::Initialize();
	if (!bOk || !WidgetTree || WidgetTree->RootWidget) return bOk;
	SetIsFocusable(true);

	UCanvasPanel* Root = WidgetTree->ConstructWidget<UCanvasPanel>(UCanvasPanel::StaticClass(), TEXT("Root"));
	WidgetTree->RootWidget = Root;

	// interaction prompt (bottom centre)
	PromptBox = WidgetTree->ConstructWidget<UBorder>(UBorder::StaticClass(), TEXT("PromptBox"));
	PromptBox->SetBrushColor(PanelColor); PromptBox->SetPadding(FMargin(14, 8));
	PromptText = Text(WidgetTree, FText::GetEmpty(), 18, FLinearColor(0.7f, 0.95f, 1.f));
	PromptBox->SetContent(PromptText);
	if (UCanvasPanelSlot* S = Root->AddChildToCanvas(PromptBox)) { S->SetAnchors(FAnchors(0.5f, 0.78f)); S->SetAlignment(FVector2D(0.5f, 0.5f)); S->SetAutoSize(true); }
	PromptBox->SetVisibility(ESlateVisibility::Collapsed);

	// objective tracker (top right)
	TrackerBox = WidgetTree->ConstructWidget<UBorder>(UBorder::StaticClass(), TEXT("TrackerBox"));
	TrackerBox->SetBrushColor(PanelColor); TrackerBox->SetPadding(FMargin(14, 10));
	UVerticalBox* TV = WidgetTree->ConstructWidget<UVerticalBox>(UVerticalBox::StaticClass());
	TrackerTitle = Text(WidgetTree, FText::GetEmpty(), 16, FLinearColor(1.f, 0.85f, 0.4f));
	TrackerObjective = Text(WidgetTree, FText::GetEmpty(), 14);
	TV->AddChildToVerticalBox(TrackerTitle); TV->AddChildToVerticalBox(TrackerObjective);
	TrackerBox->SetContent(TV);
	if (UCanvasPanelSlot* S = Root->AddChildToCanvas(TrackerBox)) { S->SetAnchors(FAnchors(1.f, 0.f)); S->SetAlignment(FVector2D(1.f, 0.f)); S->SetPosition(FVector2D(-24.f, 24.f)); S->SetAutoSize(true); }
	TrackerBox->SetVisibility(ESlateVisibility::Collapsed);

	// dialogue panel (bottom)
	DialogueBox = WidgetTree->ConstructWidget<UBorder>(UBorder::StaticClass(), TEXT("DialogueBox"));
	DialogueBox->SetBrushColor(PanelColor); DialogueBox->SetPadding(FMargin(22, 16));
	UVerticalBox* DV = WidgetTree->ConstructWidget<UVerticalBox>(UVerticalBox::StaticClass());
	SpeakerText = Text(WidgetTree, FText::GetEmpty(), 20, FLinearColor(0.55f, 0.85f, 1.f));
	BodyText = Text(WidgetTree, FText::GetEmpty(), 18);
	ChoiceList = WidgetTree->ConstructWidget<UVerticalBox>(UVerticalBox::StaticClass());
	BottomRow = WidgetTree->ConstructWidget<UHorizontalBox>(UHorizontalBox::StaticClass());
	UTextBlock* Dummy = nullptr;
	ContinueButton = MakeButton(nullptr, BottomRow, MRNarrative::UiText(TEXT("continue")), FName("continue"), 0, Dummy);
	CancelButton = MakeButton(nullptr, BottomRow, MRNarrative::UiText(TEXT("cancel")), FName("cancel"), 0, Dummy);
	if (UVerticalBoxSlot* S = DV->AddChildToVerticalBox(SpeakerText)) S->SetPadding(FMargin(0, 0, 0, 6));
	if (UVerticalBoxSlot* S = DV->AddChildToVerticalBox(BodyText)) S->SetPadding(FMargin(0, 0, 0, 10));
	DV->AddChildToVerticalBox(ChoiceList);
	if (UVerticalBoxSlot* S = DV->AddChildToVerticalBox(BottomRow)) S->SetPadding(FMargin(0, 10, 0, 0));
	DialogueBox->SetContent(DV);
	if (UCanvasPanelSlot* S = Root->AddChildToCanvas(DialogueBox)) { S->SetAnchors(FAnchors(0.1f, 0.58f, 0.9f, 0.96f)); S->SetOffsets(FMargin(0)); }
	DialogueBox->SetVisibility(ESlateVisibility::Collapsed);

	SetVisibility(ESlateVisibility::SelfHitTestInvisible);
	if (UMRNarrativeSubsystem* N = Narrative())
	{
		ViewHandle = N->GetRuntime()->OnViewChanged.AddUObject(this, &UMRNarrativeHudWidget::RefreshDialogue);
		TrackerHandle = N->OnTrackerChanged.AddUObject(this, &UMRNarrativeHudWidget::RefreshTracker);
	}
	RefreshTracker();
	return bOk;
}

void UMRNarrativeHudWidget::NativeDestruct()
{
	if (UMRNarrativeSubsystem* N = Narrative())
	{
		if (N->GetRuntime()) N->GetRuntime()->OnViewChanged.Remove(ViewHandle);
		N->OnTrackerChanged.Remove(TrackerHandle);
	}
	if (BoundInteractor.IsValid()) BoundInteractor->OnFocusChanged.Remove(FocusHandle);
	SetGameplayInputBlocked(false);
	Super::NativeDestruct();
}

void UMRNarrativeHudWidget::BindInteractor(UMRInteractorComponent* I)
{
	BoundInteractor = I;
	if (I) FocusHandle = I->OnFocusChanged.AddUObject(this, &UMRNarrativeHudWidget::RefreshPrompt);
	RefreshPrompt(I ? I->GetFocused() : nullptr);
}

void UMRNarrativeHudWidget::RefreshPrompt(UMRInteractableComponent* Focus)
{
	if (!PromptBox) return;
	UMRNarrativeSubsystem* N = Narrative();
	const bool bConversation = N && N->GetRuntime() && N->GetRuntime()->IsActive();
	if (Focus && !bConversation) { PromptText->SetText(Focus->GetPromptText()); PromptBox->SetVisibility(ESlateVisibility::HitTestInvisible); }
	else PromptBox->SetVisibility(ESlateVisibility::Collapsed);
}

void UMRNarrativeHudWidget::RefreshTracker()
{
	if (!TrackerBox) return;
	UMRNarrativeSubsystem* N = Narrative(); if (!N) return;
	const FMRTrackedObjective T = N->GetTrackedObjective();
	if (!T.bValid) { TrackerBox->SetVisibility(ESlateVisibility::Collapsed); return; }
	TrackerTitle->SetText(T.MissionTitle); TrackerObjective->SetText(T.ObjectiveText);
	TrackerBox->SetVisibility(ESlateVisibility::HitTestInvisible);
}

void UMRNarrativeHudWidget::SetGameplayInputBlocked(bool bBlocked)
{
	if (bBlocked == bBlockedInput) return;
	APlayerController* PC = GetOwningPlayer(); if (!PC) return;
	bBlockedInput = bBlocked;
	PC->SetIgnoreMoveInput(bBlocked); PC->SetIgnoreLookInput(bBlocked);
	PC->SetShowMouseCursor(bBlocked);
	if (bBlocked) { FInputModeGameAndUI M; M.SetWidgetToFocus(TakeWidget()); M.SetLockMouseToViewportBehavior(EMouseLockMode::DoNotLock); PC->SetInputMode(M); }
	else PC->SetInputMode(FInputModeGameOnly());
}

void UMRNarrativeHudWidget::RefreshDialogue()
{
	UMRNarrativeSubsystem* N = Narrative(); if (!N || !DialogueBox) return;
	const FMRDialogueView& V = N->GetRuntime()->GetView();
	if (!V.bActive)
	{
		DialogueBox->SetVisibility(ESlateVisibility::Collapsed); SetGameplayInputBlocked(false);
		RefreshPrompt(BoundInteractor.IsValid() ? BoundInteractor->GetFocused() : nullptr);
		RefreshTracker();
		return;
	}
	PromptBox->SetVisibility(ESlateVisibility::Collapsed);
	DialogueBox->SetVisibility(ESlateVisibility::Visible);
	SpeakerText->SetText(V.Speaker); BodyText->SetText(V.Text);
	ChoiceList->ClearChildren(); ChoiceButtons.Reset(); ChoiceTexts.Reset();
	Selected = 0;
	for (int32 I = 0; I < V.Choices.Num(); ++I)
	{
		UTextBlock* T = nullptr;
		UMRNarrativeButton* B = MakeButton(ChoiceList, nullptr, V.Choices[I].Text, FName("choice"), I, T);
		ChoiceButtons.Add(B); ChoiceTexts.Add(T);
	}
	for (int32 I = 0; I < ChoiceTexts.Num(); ++I)
		ChoiceTexts[I]->SetText(FText::Format(FTextFormat::FromString(TEXT("{0} {1}. {2}")), FText::FromString(I == Selected ? TEXT(">") : TEXT(" ")), FText::AsNumber(I + 1), V.Choices[I].Text));
	ContinueButton->SetVisibility(V.bCanContinue ? ESlateVisibility::Visible : ESlateVisibility::Collapsed);
	SetGameplayInputBlocked(true);
	SetKeyboardFocus();
}

void UMRNarrativeHudWidget::HandleAction(FName Action, int32 Param)
{
	UMRNarrativeSubsystem* N = Narrative(); if (!N) return;
	UMRDialogueRuntime* R = N->GetRuntime(); if (!R || !R->IsActive()) return;
	if (Action == FName("continue")) R->Continue();
	else if (Action == FName("cancel")) R->Cancel(TEXT("cancelled from the dialogue UI"));
	else if (Action == FName("choice")) R->ChooseIndex(Param);
}

bool UMRNarrativeHudWidget::HandleKey(const FKey& Key)
{
	UMRNarrativeSubsystem* N = Narrative(); if (!N) return false;
	UMRDialogueRuntime* R = N->GetRuntime(); if (!R || !R->IsActive()) return false;
	const FMRDialogueView& V = R->GetView();
	auto Mark = [this, &V]()
	{
		for (int32 I = 0; I < ChoiceTexts.Num() && I < V.Choices.Num(); ++I)
			ChoiceTexts[I]->SetText(FText::Format(FTextFormat::FromString(TEXT("{0} {1}. {2}")), FText::FromString(I == Selected ? TEXT(">") : TEXT(" ")), FText::AsNumber(I + 1), V.Choices[I].Text));
	};
	if (Key == EKeys::Escape) { R->Cancel(TEXT("cancelled with Escape")); return true; }
	if (Key == EKeys::Up || Key == EKeys::W) { if (V.Choices.Num()) { Selected = (Selected + V.Choices.Num() - 1) % V.Choices.Num(); Mark(); } return true; }
	if (Key == EKeys::Down || Key == EKeys::S) { if (V.Choices.Num()) { Selected = (Selected + 1) % V.Choices.Num(); Mark(); } return true; }
	if (Key == EKeys::Enter || Key == EKeys::SpaceBar)
	{
		if (V.bCanContinue) R->Continue(); else if (V.Choices.Num()) R->ChooseIndex(Selected);
		return true;
	}
	static const FKey Nums[9] = { EKeys::One, EKeys::Two, EKeys::Three, EKeys::Four, EKeys::Five, EKeys::Six, EKeys::Seven, EKeys::Eight, EKeys::Nine };
	for (int32 I = 0; I < 9; ++I) if (Key == Nums[I]) { if (V.Choices.IsValidIndex(I)) R->ChooseIndex(I); return true; }
	return false;
}

FReply UMRNarrativeHudWidget::NativeOnKeyDown(const FGeometry& Geo, const FKeyEvent& E)
{
	return HandleKey(E.GetKey()) ? FReply::Handled() : Super::NativeOnKeyDown(Geo, E);
}

bool UMRNarrativeHudWidget::IsDialoguePanelVisible() const { return DialogueBox && DialogueBox->GetVisibility() == ESlateVisibility::Visible; }
bool UMRNarrativeHudWidget::IsPromptVisible() const { return PromptBox && PromptBox->GetVisibility() != ESlateVisibility::Collapsed; }
bool UMRNarrativeHudWidget::IsTrackerVisible() const { return TrackerBox && TrackerBox->GetVisibility() != ESlateVisibility::Collapsed; }
bool UMRNarrativeHudWidget::IsContinueVisible() const { return ContinueButton && ContinueButton->GetVisibility() == ESlateVisibility::Visible; }
FString UMRNarrativeHudWidget::GetSpeakerString() const { return SpeakerText ? SpeakerText->GetText().ToString() : FString(); }
FString UMRNarrativeHudWidget::GetDialogueString() const { return BodyText ? BodyText->GetText().ToString() : FString(); }
FString UMRNarrativeHudWidget::GetPromptString() const { return PromptText ? PromptText->GetText().ToString() : FString(); }
FString UMRNarrativeHudWidget::GetTrackerString() const { return TrackerObjective ? TrackerTitle->GetText().ToString() + TEXT(" | ") + TrackerObjective->GetText().ToString() : FString(); }
FString UMRNarrativeHudWidget::GetChoiceString(int32 I) const { return ChoiceTexts.IsValidIndex(I) ? ChoiceTexts[I]->GetText().ToString() : FString(); }
bool UMRNarrativeHudWidget::GetChoiceButtonCenter(int32 I, FVector2D& Out) const
{
	if (!ChoiceButtons.IsValidIndex(I)) return false;
	const FGeometry G = ChoiceButtons[I]->GetCachedGeometry();
	if (G.GetLocalSize().IsNearlyZero()) return false;
	Out = G.GetAbsolutePosition() + G.GetAbsoluteSize() * 0.5f; return true;
}
