#include "AvatarV2/MRAvatarV2Controller.h"
#include "AvatarV2/MRAvatarV2Chamber.h"
#include "AvatarV2/MRAvatarV2Gate.h"
#include "AvatarV2/MRAvatarV2Session.h"
#include "AvatarV2/MRAvatarV2Widget.h"
#include "Avatar/MRAvatarSaveGame.h"
#include "Camera/CameraActor.h"
#include "Camera/CameraComponent.h"
#include "Components/CapsuleComponent.h"
#include "Engine/Engine.h"
#include "Engine/World.h"
#include "EngineUtils.h"
#include "Humanoid/MRPlayerCharacter.h"
#include "UObject/ConstructorHelpers.h"
#include "Dev/MRAvatarV2TestDriver.h"
#include "Misc/CommandLine.h"
#include "Misc/Parse.h"
#include "MoonRacer.h"

AMRAvatarV2GameMode::AMRAvatarV2GameMode()
{
	PlayerControllerClass = AMRAvatarV2Controller::StaticClass();
	static ConstructorHelpers::FClassFinder<APawn> PawnBP(TEXT("/Game/MoonRacer/Characters/Blueprints/BP_MR_AvatarPlayerCharacter"));
	DefaultPawnClass = AMRPlayerCharacter::StaticClass();
	if (PawnBP.Succeeded()) DefaultPawnClass = PawnBP.Class;
}

void AMRAvatarV2GameMode::InitGame(const FString& MapName, const FString& Options, FString& ErrorMessage)
{
	Super::InitGame(MapName, Options, ErrorMessage);
	if (!MRAvatarV2Dev::IsAllowed()) return;   // the controller reports the reason; nothing is configured
	// Dedicated V2 development slot (or an explicit non-default -MRAvatarSlot). The default player slot is never used.
	const FString Slot = MRAvatarV2Dev::ResolveSlotName();
	if (MRAvatarV2Dev::IsProtectedSlot(Slot)) return;
	UMRAvatarSaveSubsystem::SetSlotNameOverride(Slot);
	UE_LOG(LogMoonRacer, Display, TEXT("MRAV2|GATE|Avatar Creator V2 development session; avatar slot=%s"), *Slot);
}

void AMRAvatarV2GameMode::StartPlay()
{
	Super::StartPlay();
	FString TestMode;
	if (FParse::Value(FCommandLine::Get(), TEXT("MRAv2Test="), TestMode) && !TestMode.IsEmpty() && MRAvatarV2Dev::IsFlagPresent() && !MRAvatarV2Dev::IsShippingBuild())
	{
		AMRAvatarV2TestDriver* D = GetWorld()->SpawnActorDeferred<AMRAvatarV2TestDriver>(AMRAvatarV2TestDriver::StaticClass(), FTransform::Identity);
		if (D) { D->RequestedMode = TestMode; D->FinishSpawning(FTransform::Identity); }
	}
}

void AMRAvatarV2GameMode::EndPlay(const EEndPlayReason::Type Reason)
{
	UMRAvatarSaveSubsystem::SetSlotNameOverride(FString());   // do not leak the V2 slot into anything else in this process (e.g. PIE)
	Super::EndPlay(Reason);
}

AMRAvatarV2Controller::AMRAvatarV2Controller()
{
	bAutoManageActiveCameraTarget = false;
	PrimaryActorTick.bCanEverTick = true;
}

AMRPlayerCharacter* AMRAvatarV2Controller::GetCharacter() const { return Cast<AMRPlayerCharacter>(GetPawn()); }

void AMRAvatarV2Controller::OnPossess(APawn* InPawn)
{
	Super::OnPossess(InPawn);
	if (!IsLocalController()) return;
	Refusal = MRAvatarV2Dev::RefusalReason();
	if (!Refusal.IsEmpty())
	{
		UE_LOG(LogMoonRacer, Error, TEXT("MRAV2|REFUSED|%s"), *Refusal);
		if (GEngine) GEngine->AddOnScreenDebugMessage(-1, 30.f, FColor::Red, Refusal);
		return;
	}
	if (AMRPlayerCharacter* P = Cast<AMRPlayerCharacter>(InPawn)) StartCreator(P);
}

void AMRAvatarV2Controller::StartCreator(AMRPlayerCharacter* Pawn)
{
	UWorld* W = GetWorld();
	TActorIterator<AMRAvatarV2Chamber> It(W);
	if (It) Chamber = *It;
	if (!Chamber) Chamber = W->SpawnActor<AMRAvatarV2Chamber>(FVector::ZeroVector, FRotator::ZeroRotator);
	if (!Chamber) { Refusal = TEXT("could not create the development chamber"); return; }
	Chamber->Build();
	Chamber->PlaceCharacter(Pawn);

	Session = NewObject<UMRAvatarV2Session>(this);
	FString Err;
	if (!Session->Initialize(Pawn, Err)) { Refusal = TEXT("session failed: ") + Err; UE_LOG(LogMoonRacer, Error, TEXT("MRAV2|REFUSED|%s"), *Refusal); return; }

	Camera.SetAnchor(Chamber->GetCharacterFeet(), Chamber->GetCharacterFacingYaw());
	Camera.SetView(EMRV2View::FullBody, true);
	FActorSpawnParameters P; P.Name = TEXT("MRAV2_Camera");
	CameraActor = W->SpawnActor<ACameraActor>(Camera.GetLocation(), Camera.GetRotation(), P);
	ApplyCamera();
	SetViewTarget(CameraActor);
	SetIgnoreMoveInput(true); SetIgnoreLookInput(true);

	Widget = CreateWidget<UMRAvatarV2Widget>(this, UMRAvatarV2Widget::StaticClass());
	if (Widget)
	{
		Widget->CameraAction = [this](FName A, FName Pm) { CameraCommand(A, Pm); };
		Widget->OnOrbit = [this](float Y, float Pt) { Orbit(Y, Pt); };
		Widget->OnWheelZoom = [this](float D) { WheelZoom(D); };
		Widget->Bind(Session);
		Widget->AddToViewport(10);
		SetShowMouseCursor(true);
		FInputModeGameAndUI Mode; Mode.SetWidgetToFocus(Widget->TakeWidget()); Mode.SetHideCursorDuringCapture(false);
		SetInputMode(Mode);
	}
	bActive = true;
	UE_LOG(LogMoonRacer, Display, TEXT("MRAV2|READY|slot=%s"), *Session->SlotName());
}

void AMRAvatarV2Controller::CameraCommand(FName Action, FName Param)
{
	if (Action == FName("view"))
	{
		for (EMRV2View V : FMRAvatarV2CameraModel::AllViews())
			if (Param == FName(FMRAvatarV2CameraModel::Preset(V).Name)) { Camera.SetView(V); return; }
	}
	else if (Action == FName("reset_camera")) Camera.ResetCamera();
	else if (Action == FName("zoom")) Camera.Zoom(Param == FName("in") ? -40.f : 40.f);
}

void AMRAvatarV2Controller::ApplyCamera()
{
	if (!CameraActor) return;
	CameraActor->SetActorLocationAndRotation(Camera.GetLocation(), Camera.GetRotation());
	float Aspect = 16.f / 9.f; int32 SX = 0, SY = 0; GetViewportSize(SX, SY);
	if (SX > 0 && SY > 0) Aspect = (float)SX / (float)SY;
	if (UCameraComponent* C = CameraActor->GetCameraComponent()) { C->SetFieldOfView(Camera.GetHorizontalFov(Aspect)); }
	if (Chamber) Chamber->SetGlassOpacityForCameraDistance(Camera.GetDistance());
}

bool AMRAvatarV2Controller::EnsureCharacterPinned()
{
	AMRPlayerCharacter* P = GetCharacter();
	if (!P || !Chamber) return false;
	const FVector Want = Chamber->GetCharacterFeet();
	const float Half = P->GetCapsuleComponent() ? P->GetCapsuleComponent()->GetScaledCapsuleHalfHeight() : 90.f;
	if (FVector::Dist(P->GetActorLocation(), Want + FVector(0, 0, Half + 0.5f)) > 1.f) { Chamber->PlaceCharacter(P); return true; }
	return false;
}

void AMRAvatarV2Controller::PlayerTick(float Dt)
{
	Super::PlayerTick(Dt);
	if (!bActive) return;
	Camera.Tick(Dt);
	ApplyCamera();
	EnsureCharacterPinned();
}
