#include "AvatarV2/MRUi.h"
#include "Blueprint/WidgetTree.h"
#include "Brushes/SlateRoundedBoxBrush.h"
#include "Components/Border.h"
#include "Components/TextBlock.h"
#include "Styling/CoreStyle.h"

namespace MRUi
{
	const FTokens& Tokens() { static const FTokens T; return T; }
}

void UMRUiButton::InitAction(FName InAction, FName InParam)
{
	ActionName = InAction; ParamName = InParam;
	OnClicked.AddUniqueDynamic(this, &UMRUiButton::HandleClicked);
}

void UMRUiButton::HandleClicked() { OnAction.Broadcast(ActionName, ParamName); }

void UMRUiButton::SetVariant(EMRUiButtonVariant V)
{
	Variant = V;
	const MRUi::FTokens& T = MRUi::Tokens();
	FLinearColor Fill = T.ButtonFill, Outline = T.StrokeCyan * 0.6f, Hover = T.ButtonHover;
	if (V == EMRUiButtonVariant::Selected) { Fill = T.ButtonSelected; Outline = T.StrokeViolet; Hover = T.ButtonSelected; }
	else if (V == EMRUiButtonVariant::Primary) { Fill = T.ButtonPrimary; Outline = T.StrokeCyan; }
	else if (V == EMRUiButtonVariant::Subtle) { Fill = FLinearColor(0.f, 0.f, 0.f, 0.f); Outline = FLinearColor(0.f, 0.f, 0.f, 0.f); }
	Outline.A = 1.f;
	auto Brush = [&](const FLinearColor& F, const FLinearColor& O, float W) { return FSlateRoundedBoxBrush(F, T.CornerRadius, O, W); };
	FButtonStyle S = FButtonStyle::GetDefault();
	S.SetNormal(Brush(Fill, Outline, T.StrokeWidth));
	S.SetHovered(Brush(Hover, T.StrokeCyan, T.StrokeWidth));
	S.SetPressed(Brush(T.ButtonPressed, T.StrokeCyan, T.StrokeWidth));
	S.SetDisabled(Brush(T.ButtonDisabled, T.TextMuted * 0.4f, 1.f));
	S.SetNormalPadding(FMargin(10.f, 5.f)); S.SetPressedPadding(FMargin(10.f, 6.f, 10.f, 4.f));
	SetStyle(S);
	if (Label) Label->SetColorAndOpacity(FSlateColor(GetIsEnabled() ? T.TextPrimary : T.TextMuted));
}

UTextBlock* FMRUi::Text(UWidgetTree* Tree, const FString& S, ETextRole Role, float WrapAt)
{
	const MRUi::FTokens& T = MRUi::Tokens();
	UTextBlock* B = Tree->ConstructWidget<UTextBlock>(UTextBlock::StaticClass());
	int32 Size = T.FontBody; FName Face = FName("Regular"); FLinearColor C = T.TextPrimary;
	switch (Role)
	{
	case ETextRole::Title:   Size = T.FontTitle;   Face = FName("Bold"); break;
	case ETextRole::H1:      Size = T.FontH1;      Face = FName("Bold"); break;
	case ETextRole::H2:      Size = T.FontH2;      Face = FName("Bold"); C = T.StrokeCyan * 1.5f; break;
	case ETextRole::Body:    break;
	case ETextRole::Caption: Size = T.FontCaption; C = T.TextMuted; break;
	case ETextRole::Muted:   C = T.TextMuted; break;
	case ETextRole::Ok:      C = T.StateOk; break;
	case ETextRole::Warn:    C = T.StateWarn; break;
	case ETextRole::Error:   C = T.StateError; break;
	case ETextRole::Gold:    C = T.AccentGold; break;
	}
	C.A = 1.f;
	B->SetText(FText::FromString(S));
	B->SetColorAndOpacity(FSlateColor(C));
	B->SetFont(FCoreStyle::GetDefaultFontStyle(Face, Size));
	if (WrapAt > 0.f) B->SetWrapTextAt(WrapAt);   // explicit wrap width: auto-wrap inside a scroll box measures too wide and overlaps neighbours
	return B;
}

UBorder* FMRUi::Panel(UWidgetTree* Tree, const FLinearColor& Fill, const FLinearColor& Outline)
{
	const MRUi::FTokens& T = MRUi::Tokens();
	UBorder* P = Tree->ConstructWidget<UBorder>(UBorder::StaticClass());
	P->SetBrush(FSlateRoundedBoxBrush(Fill, T.CornerRadius + 2.f, Outline, T.StrokeWidth));
	P->SetPadding(T.PanelPadding);
	return P;
}

UMRUiButton* FMRUi::Button(UWidgetTree* Tree, const FString& LabelText, FName Action, FName Param, EMRUiButtonVariant Variant, float WrapAt)
{
	UMRUiButton* B = Tree->ConstructWidget<UMRUiButton>(UMRUiButton::StaticClass());
	UTextBlock* L = Text(Tree, LabelText, ETextRole::Body, WrapAt);
	B->AddChild(L);
	B->Label = L;
	B->InitAction(Action, Param);
	B->SetVariant(Variant);
	return B;
}

UBorder* FMRUi::Separator(UWidgetTree* Tree)
{
	UBorder* S = Tree->ConstructWidget<UBorder>(UBorder::StaticClass());
	S->SetBrushColor(MRUi::Tokens().StrokeCyan * 0.5f);
	S->SetPadding(FMargin(0.f, 0.5f));
	return S;
}
