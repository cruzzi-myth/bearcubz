#include "AvatarV2/MRAvatarV2Widget.h"
#include "AvatarV2/MRAvatarV2Chamber.h"
#include "AvatarV2/MRAvatarV2Camera.h"
#include "AvatarV2/MRAvatarV2Session.h"
#include "Avatar/MRAvatarTypes.h"
#include "Blueprint/WidgetTree.h"
#include "Components/Border.h"
#include "Components/CanvasPanel.h"
#include "Components/CanvasPanelSlot.h"
#include "Components/HorizontalBox.h"
#include "Components/HorizontalBoxSlot.h"
#include "Components/ScrollBox.h"
#include "Components/TextBlock.h"
#include "Components/VerticalBox.h"
#include "Components/VerticalBoxSlot.h"
#include "MoonRacer.h"

using ETR = FMRUi::ETextRole;
namespace { constexpr float PanelWrap = 330.f; }

bool UMRAvatarV2Widget::IsInViewportRegion(const FVector2D& L, const FVector2D& S)
{
	return L.X > LeftPanelWidth + 2 * Margin && L.X < S.X - RightPanelWidth - 2 * Margin && L.Y > TopBarHeight + Margin && L.Y < S.Y - BottomBarHeight - Margin;
}

bool UMRAvatarV2Widget::Initialize()
{
	const bool bOk = Super::Initialize();
	if (!bOk || !WidgetTree || WidgetTree->RootWidget) return bOk;
	UCanvasPanel* Root = WidgetTree->ConstructWidget<UCanvasPanel>(UCanvasPanel::StaticClass(), TEXT("Root"));
	WidgetTree->RootWidget = Root;
	SetVisibility(ESlateVisibility::Visible);
	const MRUi::FTokens& T = MRUi::Tokens();
	auto Slot = [&](UWidget* W, FAnchors A, FMargin O) { if (UCanvasPanelSlot* S = Root->AddChildToCanvas(W)) { S->SetAnchors(A); S->SetOffsets(O); } };

	// Top bar
	UBorder* Top = FMRUi::Panel(WidgetTree, T.BgBar, T.StrokeViolet);
	UHorizontalBox* TopRow = WidgetTree->ConstructWidget<UHorizontalBox>(UHorizontalBox::StaticClass());
	Top->SetContent(TopRow);
	if (UHorizontalBoxSlot* S = TopRow->AddChildToHorizontalBox(FMRUi::Text(WidgetTree, TEXT("MOON RACER  //  AVATAR CREATOR V2"), ETR::Title))) S->SetVerticalAlignment(VAlign_Center);
	if (UHorizontalBoxSlot* S = TopRow->AddChildToHorizontalBox(FMRUi::Text(WidgetTree, TEXT("   DEV SHELL (I1+I2) - experimental, noncanon, not the production creator"), ETR::Warn))) S->SetVerticalAlignment(VAlign_Center);
	Slot(Top, FAnchors(0, 0, 1, 0), FMargin(Margin, 8.f, Margin, TopBarHeight));

	// Left rail
	UBorder* Left = FMRUi::Panel(WidgetTree, T.BgPanel, T.StrokeCyan);
	UScrollBox* LeftScroll = WidgetTree->ConstructWidget<UScrollBox>(UScrollBox::StaticClass());
	Left->SetContent(LeftScroll);
	RailBox = WidgetTree->ConstructWidget<UVerticalBox>(UVerticalBox::StaticClass());
	LeftScroll->AddChild(RailBox);
	Slot(Left, FAnchors(0, 0, 0, 1), FMargin(Margin, TopBarHeight + Margin + 8.f, LeftPanelWidth, BottomBarHeight + Margin));

	// Right panel
	UBorder* Right = FMRUi::Panel(WidgetTree, T.BgPanel, T.StrokeCyan);
	UScrollBox* RightScroll = WidgetTree->ConstructWidget<UScrollBox>(UScrollBox::StaticClass());
	Right->SetContent(RightScroll);
	PanelBox = WidgetTree->ConstructWidget<UVerticalBox>(UVerticalBox::StaticClass());
	RightScroll->AddChild(PanelBox);
	Slot(Right, FAnchors(1, 0, 1, 1), FMargin(-(RightPanelWidth + Margin), TopBarHeight + Margin + 8.f, RightPanelWidth, BottomBarHeight + Margin));

	// Bottom bar (status, camera row, stage track)
	UBorder* Bottom = FMRUi::Panel(WidgetTree, T.BgBar, T.StrokeViolet);
	UVerticalBox* BottomCol = WidgetTree->ConstructWidget<UVerticalBox>(UVerticalBox::StaticClass());
	Bottom->SetContent(BottomCol);
	StatusText = FMRUi::Text(WidgetTree, TEXT(""), ETR::Muted);
	BottomCol->AddChildToVerticalBox(StatusText);
	BottomRow = WidgetTree->ConstructWidget<UHorizontalBox>(UHorizontalBox::StaticClass());
	BottomCol->AddChildToVerticalBox(BottomRow);
	Slot(Bottom, FAnchors(0, 1, 1, 1), FMargin(Margin, -(BottomBarHeight), Margin, BottomBarHeight - Margin));
	return bOk;
}

void UMRAvatarV2Widget::RegisterButton(UMRUiButton* B, bool bStatic)
{
	B->OnAction.AddDynamic(this, &UMRAvatarV2Widget::HandleAction);
	const FString K = Key(B->ActionName, B->ParamName);
	Buttons.Add(K, B);
	(bStatic ? StaticKeys : DynamicKeys).Add(K);
}

UMRUiButton* UMRAvatarV2Widget::AddButton(UVerticalBox* Parent, const FString& Label, FName Action, FName Param, EMRUiButtonVariant V, bool bEnabled, bool bStatic)
{
	UMRUiButton* B = FMRUi::Button(WidgetTree, Label, Action, Param, V, bStatic ? 0.f : PanelWrap - 30.f);
	B->SetIsEnabled(bEnabled);
	B->SetVariant(V);   // re-evaluate label colour for the enabled state
	RegisterButton(B, bStatic);
	if (UVerticalBoxSlot* S = Parent->AddChildToVerticalBox(B)) S->SetPadding(FMargin(0.f, 2.f));
	return B;
}

void UMRAvatarV2Widget::AddLine(UVerticalBox* Parent, const FString& S, ETR Role)
{
	UTextBlock* T = FMRUi::Text(WidgetTree, S, Role, PanelWrap);
	if (UVerticalBoxSlot* Sl = Parent->AddChildToVerticalBox(T)) Sl->SetPadding(FMargin(0.f, 3.f, 0.f, 1.f));
	PanelText += S + TEXT("\n");
}

void UMRAvatarV2Widget::Bind(UMRAvatarV2Session* InSession)
{
	Session = InSession;
	BuildStatic();
	RebuildPanel();
	Refresh();
}

void UMRAvatarV2Widget::BuildStatic()
{
	if (!RailBox || !BottomRow) return;
	RailBox->ClearChildren(); BottomRow->ClearChildren();
	for (const FString& K : StaticKeys) Buttons.Remove(K);
	StaticKeys.Reset();
	const MRUi::FTokens& T = MRUi::Tokens();

	// 14 numbered categories, grouped under their stage headings.
	if (UVerticalBoxSlot* S = RailBox->AddChildToVerticalBox(FMRUi::Text(WidgetTree, TEXT("CUSTOMIZATION NAVIGATION"), ETR::H2))) S->SetPadding(FMargin(0, 0, 0, 6));
	int32 LastStage = 0;
	for (const FMRV2Category& C : UMRAvatarV2Session::Categories())
	{
		if (C.Stage != LastStage)
		{
			LastStage = C.Stage;
			RailBox->AddChildToVerticalBox(FMRUi::Text(WidgetTree, FString::Printf(TEXT("STAGE %d - %s"), C.Stage, *UMRAvatarV2Session::Stages()[C.Stage - 1].Name.ToUpper()), ETR::Caption));
		}
		const FMRV2Capability Cap = Session ? Session->Capability(C.Number) : FMRV2Capability();
		const TCHAR* Tag = Cap.Support == EMRV2Support::Functional ? TEXT("LIVE") : Cap.Support == EMRV2Support::Partial ? TEXT("PART") : TEXT("N/A");
		AddButton(RailBox, FString::Printf(TEXT("%02d  %s   [%s]"), C.Number, *C.Name, Tag), FName("category"), FName(*FString::FromInt(C.Number)), EMRUiButtonVariant::Default, true, true);
	}

	// Bottom: camera views.
	auto AddBottom = [&](const FString& L, FName A, FName P, EMRUiButtonVariant V)
	{
		UMRUiButton* B = FMRUi::Button(WidgetTree, L, A, P, V);
		RegisterButton(B, true);
		if (UHorizontalBoxSlot* S = BottomRow->AddChildToHorizontalBox(B)) S->SetPadding(FMargin(2.f, 2.f));
	};
	auto Gap = [&]() { if (UHorizontalBoxSlot* S = BottomRow->AddChildToHorizontalBox(FMRUi::Text(WidgetTree, TEXT("  |  "), ETR::Muted))) S->SetVerticalAlignment(VAlign_Center); };
	for (EMRV2View V : FMRAvatarV2CameraModel::AllViews()) AddBottom(FMRAvatarV2CameraModel::Preset(V).Name, FName("view"), FName(FMRAvatarV2CameraModel::Preset(V).Name), EMRUiButtonVariant::Default);
	AddBottom(TEXT("Reset camera"), FName("reset_camera"), NAME_None, EMRUiButtonVariant::Subtle);
	AddBottom(TEXT("Zoom +"), FName("zoom"), FName("in"), EMRUiButtonVariant::Subtle);
	AddBottom(TEXT("Zoom -"), FName("zoom"), FName("out"), EMRUiButtonVariant::Subtle);
	Gap();
	// Six-stage track.
	for (const FMRV2Stage& S : UMRAvatarV2Session::Stages()) AddBottom(FString::Printf(TEXT("%d %s"), S.Number, *S.Name.ToUpper()), FName("stage"), FName(*FString::FromInt(S.Number)), EMRUiButtonVariant::Default);
	Gap();
	AddBottom(TEXT("< Back"), FName("back"), NAME_None, EMRUiButtonVariant::Subtle);
	AddBottom(TEXT("Next >"), FName("next"), NAME_None, EMRUiButtonVariant::Primary);
	(void)T;
}

void UMRAvatarV2Widget::SelectStage(int32 N)
{
	Stage = FMath::Clamp(N, 1, 6);
	const TArray<int32> Cats = UMRAvatarV2Session::CategoriesOfStage(Stage);
	Category = Cats.Num() ? Cats[0] : 0;   // 0 = Final Review
}

void UMRAvatarV2Widget::SelectCategory(int32 N)
{
	if (N < 1 || N > 14) return;
	Category = N; Stage = UMRAvatarV2Session::Categories()[N - 1].Stage;
}

void UMRAvatarV2Widget::SetStatus(const FString& S)
{
	StatusLine = S;
	if (StatusText) StatusText->SetText(FText::FromString(S));
}

void UMRAvatarV2Widget::Refresh()
{
	// Selected highlight on static buttons; keeps labels (capability tags) in step with the catalog.
	for (const FString& K : StaticKeys)
	{
		UMRUiButton* B = Buttons.FindRef(K); if (!B) continue;
		bool bSel = false;
		if (B->ActionName == FName("category")) bSel = (FCString::Atoi(*B->ParamName.ToString()) == Category);
		else if (B->ActionName == FName("stage")) bSel = (FCString::Atoi(*B->ParamName.ToString()) == Stage);
		const EMRUiButtonVariant Base = (B->ActionName == FName("next")) ? EMRUiButtonVariant::Primary : (B->ActionName == FName("back") || B->ActionName == FName("reset_camera") || B->ActionName == FName("zoom")) ? EMRUiButtonVariant::Subtle : EMRUiButtonVariant::Default;
		B->SetVariant(bSel ? EMRUiButtonVariant::Selected : Base);
	}
	SetStatus(Session ? Session->LastStatus() : FString());
}

void UMRAvatarV2Widget::AddOptionList(UVerticalBox* Parent, int32 KindAsInt, FName Action)
{
	if (!Session) return;
	const TArray<FMRV2Option> Opts = Session->Options((EMRV2OptionKind)KindAsInt);
	for (const FMRV2Option& O : Opts)
	{
		const FString L = O.Note.IsEmpty() ? O.Label : FString::Printf(TEXT("%s  (%s)"), *O.Label, *O.Note);
		AddButton(Parent, (O.bSelected ? TEXT("[x] ") : TEXT("[ ] ")) + L, Action, O.Id, O.bSelected ? EMRUiButtonVariant::Selected : EMRUiButtonVariant::Default);
		PanelText += L + TEXT("\n");
	}
	if (Opts.Num() == 0) AddLine(Parent, TEXT("No options are available for this slot."), ETR::Muted);
}

void UMRAvatarV2Widget::AddUnavailable(UVerticalBox* Parent, int32 N)
{
	if (!Session) return;
	const FMRV2Capability Cap = Session->Capability(N);
	if (Cap.Unavailable.Num() == 0) return;
	AddLine(Parent, TEXT("NOT AVAILABLE (and why)"), ETR::Warn);
	for (const FString& U : Cap.Unavailable) AddLine(Parent, TEXT("- ") + U, ETR::Muted);
}

void UMRAvatarV2Widget::AddReview(UVerticalBox* Parent)
{
	if (!Session) return;
	const FMRAvatarAppearance& W = Session->Working();
	AddLine(Parent, TEXT("FINAL REVIEW (development)"), ETR::H1);
	AddLine(Parent, TEXT("Reflects the live preview state. The full review and finalize flow is a later milestone."), ETR::Muted);
	AddLine(Parent, FString::Printf(TEXT("Species id: %s  (shared development body)"), *W.SpeciesId.ToString()), ETR::Body);
	AddLine(Parent, FString::Printf(TEXT("Development body: %s"), *W.BodyBaseId.ToString()), ETR::Body);
	FString Acc; for (const FName& A : W.AccessoryIds) Acc += (Acc.IsEmpty() ? TEXT("") : TEXT(", ")) + A.ToString();
	AddLine(Parent, TEXT("Accessories: ") + (Acc.IsEmpty() ? FString(TEXT("none")) : Acc), ETR::Body);
	AddLine(Parent, FString::Printf(TEXT("Material variant: %s"), W.MaterialVariantId.IsNone() ? TEXT("none") : *W.MaterialVariantId.ToString()), ETR::Body);
	AddLine(Parent, FString::Printf(TEXT("Original House Crest: %s %s"), Session->OriginalCrestId().IsNone() ? TEXT("not chosen") : *Session->OriginalCrestId().ToString(), Session->IsCrestLocked() ? TEXT("(locked, session only)") : TEXT("")), ETR::Body);
	AddLine(Parent, FString::Printf(TEXT("Development slot: %s"), *Session->SlotName()), ETR::Muted);
	AddButton(Parent, TEXT("Save to development slot"), FName("save"), NAME_None, EMRUiButtonVariant::Primary);
	AddButton(Parent, TEXT("Load from development slot"), FName("load"), NAME_None, EMRUiButtonVariant::Default);
	AddButton(Parent, TEXT("Revert to last saved/loaded"), FName("revert"), NAME_None, EMRUiButtonVariant::Default);
	AddButton(Parent, TEXT("Reset appearance to default"), FName("reset"), NAME_None, EMRUiButtonVariant::Default);
	AddLine(Parent, TEXT("Not in this milestone: preview captures, preset files, name/callsign, House save record, finalize and onboarding hand-off."), ETR::Muted);
}

void UMRAvatarV2Widget::RebuildPanel()
{
	if (!PanelBox) return;
	PanelBox->ClearChildren();
	for (const FString& K : DynamicKeys) Buttons.Remove(K);
	DynamicKeys.Reset(); PanelText.Reset();
	if (!Session) return;

	if (Category == 0) { AddReview(PanelBox); return; }
	const FMRV2Category& C = UMRAvatarV2Session::Categories()[Category - 1];
	const FMRV2Capability Cap = Session->Capability(Category);
	AddLine(PanelBox, FString::Printf(TEXT("%02d  %s"), C.Number, *C.Name.ToUpper()), ETR::H1);
	const TCHAR* Tag = Cap.Support == EMRV2Support::Functional ? TEXT("FUNCTIONAL") : Cap.Support == EMRV2Support::Partial ? TEXT("PARTIALLY FUNCTIONAL") : TEXT("NOT AVAILABLE YET");
	AddLine(PanelBox, Tag, Cap.Support == EMRV2Support::Unavailable ? ETR::Warn : ETR::Ok);
	AddLine(PanelBox, Cap.Summary, ETR::Muted);
	PanelBox->AddChildToVerticalBox(FMRUi::Separator(WidgetTree));

	switch (Category)
	{
	case 1:
		AddLine(PanelBox, TEXT("SPECIES (canonical ids)"), ETR::H2);
		AddOptionList(PanelBox, (int32)EMRV2OptionKind::Species, FName("species"));
		break;
	case 2:
		AddLine(PanelBox, TEXT("DEVELOPMENT BODY"), ETR::H2);
		AddOptionList(PanelBox, (int32)EMRV2OptionKind::Body, FName("body"));
		break;
	case 11:
		AddLine(PanelBox, TEXT("ACCESSORIES (rigid dev props)"), ETR::H2);
		AddOptionList(PanelBox, (int32)EMRV2OptionKind::Accessory, FName("accessory"));
		break;
	case 12:
		AddLine(PanelBox, TEXT("MATERIAL VARIANT (dev)"), ETR::H2);
		AddOptionList(PanelBox, (int32)EMRV2OptionKind::Material, FName("material"));
		break;
	case 13:
		AddLine(PanelBox, TEXT("ORIGINAL HOUSE CREST"), ETR::H2);
		AddLine(PanelBox, Session->OriginalCrestId().IsNone() ? TEXT("Not chosen yet.") : Session->OriginalCrestId().ToString() + (Session->IsCrestLocked() ? TEXT("  (LOCKED: set at creation)") : TEXT("  (provisional until the avatar is saved)")), ETR::Gold);
		AddLine(PanelBox, TEXT("ACTIVE HOUSE CREST"), ETR::H2);
		AddLine(PanelBox, Session->ActiveCrestId().IsNone() ? TEXT("Same as the Original at creation.") : Session->ActiveCrestId().ToString(), ETR::Body);
		AddLine(PanelBox, TEXT("CHOOSE A PLACEHOLDER (NONCANON)"), ETR::H2);
		AddOptionList(PanelBox, (int32)EMRV2OptionKind::Crest, FName("crest"));
		AddLine(PanelBox, TEXT("Future crest changes: unavailable. They would require an approved progression checkpoint and none are defined."), ETR::Muted);
		break;
	default: break;
	}
	AddUnavailable(PanelBox, Category);
}

bool UMRAvatarV2Widget::HasButton(FName A, FName P) const { return Buttons.Contains(Key(A, P)); }
bool UMRAvatarV2Widget::IsButtonEnabled(FName A, FName P) const { const TObjectPtr<UMRUiButton>* B = Buttons.Find(Key(A, P)); return B && *B && (*B)->GetIsEnabled(); }
FString UMRAvatarV2Widget::GetButtonLabel(FName A, FName P) const { const TObjectPtr<UMRUiButton>* B = Buttons.Find(Key(A, P)); return (B && *B && (*B)->Label) ? (*B)->Label->GetText().ToString() : FString(); }

void UMRAvatarV2Widget::HandleAction(FName Action, FName Param)
{
	if (!Session) return;
	bool bRebuild = true;
	FString Msg;
	if (Action == FName("stage")) SelectStage(FCString::Atoi(*Param.ToString()));
	else if (Action == FName("category")) SelectCategory(FCString::Atoi(*Param.ToString()));
	else if (Action == FName("next")) SelectStage(Stage + 1);
	else if (Action == FName("back")) SelectStage(Stage - 1);
	else if (Action == FName("view") || Action == FName("reset_camera") || Action == FName("zoom")) { if (CameraAction) CameraAction(Action, Param); bRebuild = false; }
	else if (Action == FName("species")) Session->SetSpecies(Param);
	else if (Action == FName("body")) Session->SetBody(Param);
	else if (Action == FName("accessory")) Session->ToggleAccessory(Param);
	else if (Action == FName("material")) Session->SetMaterialVariant(Param);
	else if (Action == FName("crest")) Session->SelectCrest(Param);
	else if (Action == FName("save")) Session->SaveToDevSlot();
	else if (Action == FName("load")) Session->LoadFromDevSlot();
	else if (Action == FName("revert")) Session->RevertToCommitted();
	else if (Action == FName("reset")) Session->ResetAppearance();
	else { SetStatus(FString::Printf(TEXT("Unknown action '%s'"), *Action.ToString())); return; }
	if (bRebuild) RebuildPanel();
	Refresh();
}

FReply UMRAvatarV2Widget::NativeOnMouseButtonDown(const FGeometry& G, const FPointerEvent& E)
{
	if (E.GetEffectingButton() == EKeys::LeftMouseButton && IsInViewportRegion(G.AbsoluteToLocal(E.GetScreenSpacePosition()), G.GetLocalSize()))
	{
		bDragging = true;
		return FReply::Handled().CaptureMouse(TakeWidget());
	}
	return Super::NativeOnMouseButtonDown(G, E);
}

FReply UMRAvatarV2Widget::NativeOnMouseButtonUp(const FGeometry& G, const FPointerEvent& E)
{
	if (bDragging && E.GetEffectingButton() == EKeys::LeftMouseButton) { bDragging = false; return FReply::Handled().ReleaseMouseCapture(); }
	return Super::NativeOnMouseButtonUp(G, E);
}

FReply UMRAvatarV2Widget::NativeOnMouseMove(const FGeometry& G, const FPointerEvent& E)
{
	if (bDragging && OnOrbit) { const FVector2D D = E.GetCursorDelta(); OnOrbit(-D.X * 0.35f, D.Y * 0.2f); return FReply::Handled(); }
	return Super::NativeOnMouseMove(G, E);
}

FReply UMRAvatarV2Widget::NativeOnMouseWheel(const FGeometry& G, const FPointerEvent& E)
{
	if (OnWheelZoom && IsInViewportRegion(G.AbsoluteToLocal(E.GetScreenSpacePosition()), G.GetLocalSize())) { OnWheelZoom(E.GetWheelDelta()); return FReply::Handled(); }
	return Super::NativeOnMouseWheel(G, E);
}
