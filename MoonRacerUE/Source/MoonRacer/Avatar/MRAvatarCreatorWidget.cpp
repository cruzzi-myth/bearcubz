#include "Avatar/MRAvatarCreatorWidget.h"
#include "Avatar/MRAvatarCatalog.h"
#include "Avatar/MRAvatarCustomizationComponent.h"
#include "Avatar/MRAvatarSaveGame.h"
#include "Humanoid/MRPlayerCharacter.h"
#include "Blueprint/WidgetTree.h"
#include "Components/Border.h"
#include "Components/CanvasPanel.h"
#include "Components/CanvasPanelSlot.h"
#include "Components/ScrollBox.h"
#include "Components/TextBlock.h"
#include "Components/VerticalBox.h"
#include "Components/VerticalBoxSlot.h"
#include "Engine/GameInstance.h"
#include "GameFramework/SpringArmComponent.h"
#include "Styling/CoreStyle.h"
#include "MoonRacer.h"

void UMRCreatorButton::InitAction(FName InAction, FName InParam)
{
	ActionName = InAction;
	ParamName = InParam;
	OnClicked.AddUniqueDynamic(this, &UMRCreatorButton::HandleClicked);
}

void UMRCreatorButton::HandleClicked()
{
	UE_LOG(LogMoonRacer, Display, TEXT("MRAVATAR|UI|HandleClicked %s:%s (OnAction bound=%d)"), *ActionName.ToString(), *ParamName.ToString(), OnAction.IsBound());
	OnAction.Broadcast(ActionName, ParamName);
}

bool UMRAvatarCreatorWidget::Initialize()
{
	const bool bOk = Super::Initialize();
	if (!bOk || !WidgetTree || WidgetTree->RootWidget) return bOk;

	UCanvasPanel* Root = WidgetTree->ConstructWidget<UCanvasPanel>(UCanvasPanel::StaticClass(), TEXT("Root"));
	WidgetTree->RootWidget = Root;

	UBorder* Panel = WidgetTree->ConstructWidget<UBorder>(UBorder::StaticClass(), TEXT("Panel"));
	Panel->SetBrushColor(FLinearColor(0.f, 0.f, 0.f, 0.72f));
	Panel->SetPadding(FMargin(14.f));
	if (UCanvasPanelSlot* S = Root->AddChildToCanvas(Panel))
	{
		S->SetAnchors(FAnchors(0.f, 0.f, 0.f, 1.f));
		S->SetOffsets(FMargin(16.f, 16.f, 470.f, 16.f)); // left, top, width, bottom
	}
	UScrollBox* Scroll = WidgetTree->ConstructWidget<UScrollBox>(UScrollBox::StaticClass(), TEXT("Scroll"));
	Panel->SetContent(Scroll);
	ScrollBox = Scroll;
	Content = WidgetTree->ConstructWidget<UVerticalBox>(UVerticalBox::StaticClass(), TEXT("Content"));
	Scroll->AddChild(Content);
	return bOk;
}

UTextBlock* UMRAvatarCreatorWidget::AddText(UVerticalBox* Parent, const FString& Text, const FLinearColor& Color, int32 Size)
{
	UTextBlock* T = WidgetTree->ConstructWidget<UTextBlock>(UTextBlock::StaticClass());
	T->SetText(FText::FromString(Text));
	T->SetColorAndOpacity(FSlateColor(Color));
	T->SetFont(FCoreStyle::GetDefaultFontStyle("Regular", Size));
	T->SetAutoWrapText(true);
	if (UVerticalBoxSlot* S = Parent->AddChildToVerticalBox(T)) S->SetPadding(FMargin(0.f, 4.f, 0.f, 2.f));
	return T;
}

UMRCreatorButton* UMRAvatarCreatorWidget::AddButton(UVerticalBox* Parent, const FString& Label, FName Action, FName Param)
{
	UMRCreatorButton* B = WidgetTree->ConstructWidget<UMRCreatorButton>(UMRCreatorButton::StaticClass());
	UTextBlock* T = WidgetTree->ConstructWidget<UTextBlock>(UTextBlock::StaticClass());
	T->SetText(FText::FromString(Label));
	T->SetFont(FCoreStyle::GetDefaultFontStyle("Regular", 14));
	B->AddChild(T);
	B->InitAction(Action, Param);
	B->OnAction.AddDynamic(this, &UMRAvatarCreatorWidget::HandleAction);
	if (UVerticalBoxSlot* S = Parent->AddChildToVerticalBox(B)) S->SetPadding(FMargin(0.f, 2.f));
	const FString Key = KeyOf(Action, Param);
	ButtonTexts.Add(Key, T);
	Buttons.Add(Key, B);
	BaseLabels.Add(Key, Label);
	ButtonKeys.Add(Key);
	return B;
}

bool UMRAvatarCreatorWidget::GetButtonCenter(FName Action, FName Param, FVector2D& OutAbsolute) const
{
	const TObjectPtr<UMRCreatorButton>* B = Buttons.Find(KeyOf(Action, Param));
	if (!B || !*B) return false;
	const FGeometry G = (*B)->GetCachedGeometry();
	if (G.GetAbsoluteSize().IsNearlyZero()) return false;
	OutAbsolute = FVector2D(G.GetAbsolutePosition()) + FVector2D(G.GetAbsoluteSize()) * 0.5;
	return true;
}

FString UMRAvatarCreatorWidget::GetButtonLabel(FName Action, FName Param) const
{
	const TObjectPtr<UTextBlock>* T = ButtonTexts.Find(KeyOf(Action, Param));
	return (T && *T) ? (*T)->GetText().ToString() : FString();
}

FString UMRAvatarCreatorWidget::GetButtonDebug(FName Action, FName Param) const
{
	const TObjectPtr<UMRCreatorButton>* B = Buttons.Find(KeyOf(Action, Param));
	if (!B || !*B) return TEXT("no button");
	return FString::Printf(TEXT("hover=%d pressed=%d enabled=%d visible=%d"), (*B)->IsHovered(), (*B)->IsPressed(), (*B)->GetIsEnabled(), (*B)->IsVisible());
}

bool UMRAvatarCreatorWidget::GetScrollViewport(FVector2D& OutMin, FVector2D& OutMax) const
{
	if (!ScrollBox) return false;
	const FGeometry G = ScrollBox->GetCachedGeometry();
	if (G.GetAbsoluteSize().IsNearlyZero()) return false;
	OutMin = FVector2D(G.GetAbsolutePosition());
	OutMax = OutMin + FVector2D(G.GetAbsoluteSize());
	return true;
}

bool UMRAvatarCreatorWidget::HasButton(FName Action, FName Param) const
{
	return ButtonKeys.Contains(KeyOf(Action, Param));
}

void UMRAvatarCreatorWidget::SyncWorking()
{
	UMRAvatarCustomizationComponent* Comp = Target ? Target->AvatarCustomization.Get() : nullptr;
	if (Comp && Comp->HasApplied() && Comp->GetCurrentAppearance() != Working)
	{
		Working = Comp->GetCurrentAppearance();
		Refresh();
	}
}

void UMRAvatarCreatorWidget::NativeTick(const FGeometry& MyGeometry, float InDeltaTime)
{
	Super::NativeTick(MyGeometry, InDeltaTime);
	SyncWorking();
}

void UMRAvatarCreatorWidget::SetTarget(AMRPlayerCharacter* InTarget)
{
	Target = InTarget;
	if (Target && Target->AvatarCustomization)
	{
		Working = Target->AvatarCustomization->GetCurrentAppearance();
	}
	Rebuild();
}

void UMRAvatarCreatorWidget::Rebuild()
{
	if (!Content) return;
	Content->ClearChildren();
	ButtonTexts.Empty(); BaseLabels.Empty(); ButtonKeys.Empty(); Buttons.Empty();

	UMRAvatarCustomizationComponent* Comp = Target ? Target->AvatarCustomization.Get() : nullptr;
	UMRAvatarCatalog* Catalog = Comp ? Comp->GetCatalog() : nullptr;

	AddText(Content, TEXT("AVATAR CREATOR  (DEVELOPMENT BUILD)"), FLinearColor::White, 22);
	AddText(Content, TEXT("DEV ONLY: Manny and Quinn are Epic mannequin PLACEHOLDER meshes, not Moon Racer avatar designs."), FLinearColor(1.f, 0.6f, 0.1f), 13);
	if (!Catalog)
	{
		AddText(Content, TEXT("Avatar catalog not available."), FLinearColor::Red, 14);
		return;
	}

	AddText(Content, TEXT("ACTIONS"), FLinearColor(0.4f, 0.9f, 1.f), 15);
	AddButton(Content, TEXT("CONFIRM  (save)"), TEXT("confirm"), NAME_None);
	AddButton(Content, TEXT("CANCEL  (revert to last saved)"), TEXT("cancel"), NAME_None);
	AddButton(Content, TEXT("RESET  (defaults)"), TEXT("reset"), NAME_None);
	StatusText = AddText(Content, Status, FLinearColor(0.6f, 1.f, 0.6f), 13);
	AddText(Content, TEXT("VIEW"), FLinearColor(0.4f, 0.9f, 1.f), 15);
	AddButton(Content, TEXT("Rotate left"), TEXT("rotate"), TEXT("left"));
	AddButton(Content, TEXT("Rotate right"), TEXT("rotate"), TEXT("right"));
	AddButton(Content, TEXT("Zoom in"), TEXT("zoom"), TEXT("in"));
	AddButton(Content, TEXT("Zoom out"), TEXT("zoom"), TEXT("out"));

	AddText(Content, TEXT("SPECIES  (canonical IDs)"), FLinearColor(0.4f, 0.9f, 1.f), 15);
	for (const FMRSpeciesEntry& S : Catalog->Species)
	{
		const bool bPending = S.Assessment == EMRSpeciesAssessment::Unassessed;
		AddButton(Content, FString::Printf(TEXT("%s  (%s)%s"), *S.DisplayName.ToString(), *S.Id.ToString(), bPending ? TEXT("  - 3D model PENDING") : TEXT("")), TEXT("species"), S.Id);
	}

	AddText(Content, TEXT("BODY  (dev placeholders)"), FLinearColor(0.4f, 0.9f, 1.f), 15);
	for (const FMRAvatarOption& O : Catalog->Bodies)
		if (O.IsAvailable()) AddButton(Content, O.DisplayName.ToString(), TEXT("body"), O.Id);

	bool bAnyVariant = false;
	for (const FMRAvatarOption& O : Catalog->MaterialVariants) bAnyVariant |= O.IsAvailable();
	if (bAnyVariant)
	{
		AddText(Content, TEXT("MATERIAL VARIANT"), FLinearColor(0.4f, 0.9f, 1.f), 15);
		for (const FMRAvatarOption& O : Catalog->MaterialVariants)
			if (O.IsAvailable()) AddButton(Content, O.DisplayName.ToString(), TEXT("material"), O.Id);
	}

	bool bAnyAccessory = false;
	for (const FMRAvatarOption& O : Catalog->Accessories) bAnyAccessory |= O.IsAvailable();
	if (bAnyAccessory)
	{
		AddText(Content, TEXT("ACCESSORIES  (rigid dev markers)"), FLinearColor(0.4f, 0.9f, 1.f), 15);
		for (const FMRAvatarOption& O : Catalog->Accessories)
			if (O.IsAvailable()) AddButton(Content, O.DisplayName.ToString(), TEXT("accessory"), O.Id);
	}

	auto CountPending = [](const TArray<FMRAvatarOption>& L) { int32 N = 0; for (const FMRAvatarOption& O : L) if (!O.IsAvailable()) ++N; return N; };
	AddText(Content, FString::Printf(TEXT("NOT AVAILABLE YET (no 3D assets, hidden): hair x%d, eyes x%d, outfits x%d, signal accents x%d, canonical accessories x%d. All six species are 3D-pending."),
		CountPending(Catalog->Hair), CountPending(Catalog->Eyes), CountPending(Catalog->Outfits), CountPending(Catalog->SignalAccents), CountPending(Catalog->Accessories)), FLinearColor(0.7f, 0.7f, 0.7f), 12);

	Refresh();
}

bool UMRAvatarCreatorWidget::IsSelected(FName Action, FName Param) const
{
	if (Action == TEXT("species")) return Working.SpeciesId == Param;
	if (Action == TEXT("body")) return Working.BodyBaseId == Param;
	if (Action == TEXT("material")) return Working.MaterialVariantId == Param;
	if (Action == TEXT("accessory")) return Working.AccessoryIds.Contains(Param);
	return false;
}

void UMRAvatarCreatorWidget::Refresh()
{
	for (const TPair<FString, TObjectPtr<UTextBlock>>& P : ButtonTexts)
	{
		FString Action, Param;
		P.Key.Split(TEXT(":"), &Action, &Param);
		const bool bSel = IsSelected(FName(*Action), FName(*Param));
		const bool bSelectable = Action == TEXT("species") || Action == TEXT("body") || Action == TEXT("material") || Action == TEXT("accessory");
		if (P.Value) P.Value->SetText(FText::FromString((bSelectable ? (bSel ? TEXT("[x] ") : TEXT("[  ] ")) : TEXT("")) + BaseLabels[P.Key]));
	}
	if (StatusText) StatusText->SetText(FText::FromString(Status));
}

void UMRAvatarCreatorWidget::SetStatus(const FString& S)
{
	Status = S;
	UE_LOG(LogMoonRacer, Display, TEXT("MRAVATAR|UI|%s"), *S);
	if (StatusText) StatusText->SetText(FText::FromString(S));
}

void UMRAvatarCreatorWidget::TryPreview(const FMRAvatarAppearance& Candidate)
{
	UMRAvatarCustomizationComponent* Comp = Target ? Target->AvatarCustomization.Get() : nullptr;
	if (!Comp) { SetStatus(TEXT("no target character")); return; }
	const FMRAvatarApplyResult R = Comp->PreviewAppearance(Candidate);
	if (R.bApplied)
	{
		Working = Candidate;
		SetStatus(TEXT("Previewing (not saved). ") + R.Message);
	}
	else
	{
		SetStatus(TEXT("Rejected: ") + R.Message);
	}
	Refresh();
}

void UMRAvatarCreatorWidget::Confirm()
{
	UMRAvatarCustomizationComponent* Comp = Target ? Target->AvatarCustomization.Get() : nullptr;
	UGameInstance* GI = GetGameInstance();
	UMRAvatarSaveSubsystem* Save = GI ? GI->GetSubsystem<UMRAvatarSaveSubsystem>() : nullptr;
	if (!Comp || !Save) { SetStatus(TEXT("cannot save: missing component or save subsystem")); return; }

	FMRAvatarAppearance C = Comp->GetCurrentAppearance();
	C.Revision = Comp->GetCommittedAppearance().Revision + 1;
	FString Error;
	if (!Save->SaveAppearance(C, Error))
	{
		Comp->RevertToCommitted();
		Working = Comp->GetCurrentAppearance();
		SetStatus(TEXT("Save rejected: ") + Error);
		Refresh();
		return;
	}
	Comp->PreviewAppearance(C);
	Comp->CommitCurrent();
	Working = C;
	SetStatus(FString::Printf(TEXT("Confirmed and saved locally (revision %d)."), C.Revision));
	Refresh();
}

void UMRAvatarCreatorWidget::HandleAction(FName Action, FName Param)
{
	UE_LOG(LogMoonRacer, Display, TEXT("MRAVATAR|UI|HandleAction %s:%s"), *Action.ToString(), *Param.ToString());
	UMRAvatarCustomizationComponent* Comp = Target ? Target->AvatarCustomization.Get() : nullptr;
	UMRAvatarCatalog* Catalog = Comp ? Comp->GetCatalog() : nullptr;
	if (!Comp || !Catalog) { SetStatus(TEXT("no target character or catalog")); return; }

	SyncWorking();
	FMRAvatarAppearance W = Working;
	if (Action == TEXT("species")) { W.SpeciesId = Param; TryPreview(W); }
	else if (Action == TEXT("body"))
	{
		W.BodyBaseId = Param;
		// If the chosen material variant is not supported on the new body, fall back to the default variant.
		const FMRAvatarOption* V = Catalog->FindMaterialVariant(W.MaterialVariantId);
		if (V && V->MaterialBindings.Num() > 0 && !V->MaterialBindings.ContainsByPredicate([&](const FMRMaterialBinding& B) { return B.BodyId == W.BodyBaseId; }))
			W.MaterialVariantId = Catalog->DefaultMaterialVariantId;
		TryPreview(W);
	}
	else if (Action == TEXT("material")) { W.MaterialVariantId = Param; TryPreview(W); }
	else if (Action == TEXT("accessory"))
	{
		if (W.AccessoryIds.Contains(Param)) W.AccessoryIds.Remove(Param);
		else
		{
			// Replace any accessory already on the same attachment point.
			if (const FMRAvatarOption* New = Catalog->FindAccessory(Param))
				W.AccessoryIds.RemoveAll([&](const FName& Id) { const FMRAvatarOption* O = Catalog->FindAccessory(Id); return O && O->AttachmentPointId == New->AttachmentPointId; });
			W.AccessoryIds.Add(Param);
		}
		TryPreview(W);
	}
	else if (Action == TEXT("rotate"))
	{
		if (Target) Target->AddActorLocalRotation(FRotator(0.f, Param == TEXT("left") ? -25.f : 25.f, 0.f));
		SetStatus(TEXT("Rotated preview."));
	}
	else if (Action == TEXT("zoom"))
	{
		if (Target && Target->GetCameraBoom())
		{
			USpringArmComponent* Boom = Target->GetCameraBoom();
			Boom->TargetArmLength = FMath::Clamp(Boom->TargetArmLength + (Param == TEXT("in") ? -50.f : 50.f), 120.f, 600.f);
			SetStatus(FString::Printf(TEXT("Zoom: camera distance %.0f"), Boom->TargetArmLength));
		}
	}
	else if (Action == TEXT("confirm")) { Confirm(); }
	else if (Action == TEXT("cancel"))
	{
		const FMRAvatarApplyResult R = Comp->RevertToCommitted();
		Working = Comp->GetCurrentAppearance();
		SetStatus(R.bApplied ? TEXT("Cancelled: reverted to last saved appearance.") : TEXT("Cancel failed: ") + R.Message);
		Refresh();
	}
	else if (Action == TEXT("reset"))
	{
		const FMRAvatarApplyResult R = Comp->ResetToDefault();
		Working = Comp->GetCurrentAppearance();
		SetStatus(R.bApplied ? TEXT("Reset to defaults (not saved until Confirm).") : TEXT("Reset failed: ") + R.Message);
		Refresh();
	}
	else { SetStatus(FString::Printf(TEXT("Unknown action '%s'"), *Action.ToString())); }
}

void AMRAvatarCreatorController::ClientRestart_Implementation(APawn* NewPawn)
{
	Super::ClientRestart_Implementation(NewPawn);
	// Front-facing camera; the pawn faces +X, so look back along -X.
	SetControlRotation(FRotator(-5.f, 180.f, 0.f));
}

void AMRAvatarCreatorController::PlayerTick(float DeltaTime)
{
	Super::PlayerTick(DeltaTime);
	// Possession/restart can reset the control rotation to the pawn's; hold the front-facing view for the first frames.
	if (GetPawn() && FrontViewFrames < 30)
	{
		SetControlRotation(FRotator(-5.f, 180.f, 0.f));
		++FrontViewFrames;
	}
}

void AMRAvatarCreatorController::OnPossess(APawn* InPawn)
{
	Super::OnPossess(InPawn);
	AMRPlayerCharacter* Pawn = Cast<AMRPlayerCharacter>(InPawn);
	if (!Pawn || !IsLocalController()) return;

	SetControlRotation(FRotator(-5.f, 180.f, 0.f));
	if (Pawn->GetCameraBoom()) Pawn->GetCameraBoom()->TargetArmLength = 320.f;

	Widget = CreateWidget<UMRAvatarCreatorWidget>(this, UMRAvatarCreatorWidget::StaticClass());
	if (Widget)
	{
		Widget->AddToViewport(10);
		Widget->SetTarget(Pawn);
		SetShowMouseCursor(true);
		FInputModeGameAndUI Mode;
		Mode.SetWidgetToFocus(Widget->TakeWidget());
		SetInputMode(Mode);
	}
}
