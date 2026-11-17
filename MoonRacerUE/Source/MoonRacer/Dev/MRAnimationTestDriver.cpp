#include "Dev/MRAnimationTestDriver.h"
#include "Humanoid/MRPlayerCharacter.h"
#include "Humanoid/MRAttachmentPoints.h"
#include "Animation/AnimInstance.h"
#include "Components/SkeletalMeshComponent.h"
#include "Components/CapsuleComponent.h"
#include "GameFramework/SpringArmComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/SkeletalMesh.h"
#include "Engine/SkeletalMeshSocket.h"
#include "Engine/StaticMesh.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "GameFramework/PlayerController.h"
#include "GameFramework/Controller.h"
#include "Kismet/GameplayStatics.h"
#include "Kismet/KismetSystemLibrary.h"
#include "UnrealClient.h"
#include "Components/SceneCaptureComponent2D.h"
#include "Engine/TextureRenderTarget2D.h"
#include "Kismet/KismetRenderingLibrary.h"
#include "Kismet/KismetMathLibrary.h"
#include "Misc/Paths.h"
#include "Components/LightComponent.h"
#include "Components/SkyAtmosphereComponent.h"
#include "UObject/UObjectIterator.h"
#include "Materials/MaterialInterface.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Misc/CommandLine.h"
#include "MoonRacer.h"

namespace
{
	float WalkInputValue()
	{
		float V = 0.50f; FParse::Value(FCommandLine::Get(), TEXT("MRWalkInput="), V); return V;
	}   // fraction of MaxWalkSpeed (600) -> 300 cm/s (blend space walk row)
	constexpr float JogInput = 1.0f;
	constexpr float AccessoryTolerance = 3.0f; // cm
}


namespace
{
	// Distinct colour per attachment point so each one can be identified in screenshots.
	FLinearColor PointColor(FName Id)
	{
		static const TMap<FName, FLinearColor> Map = {
			{TEXT("MR_Head_Top"), FLinearColor(1.f, 0.05f, 0.05f)},     // red
			{TEXT("MR_Head_Face"), FLinearColor(1.f, 0.9f, 0.f)},       // yellow
			{TEXT("MR_Chest"), FLinearColor(0.05f, 0.9f, 0.1f)},        // green
			{TEXT("MR_Back_Upper"), FLinearColor(0.1f, 0.2f, 1.f)},     // blue
			{TEXT("MR_Back_Lower"), FLinearColor(0.f, 0.9f, 0.9f)},     // cyan
			{TEXT("MR_Hip_L"), FLinearColor(1.f, 0.f, 0.9f)},           // magenta
			{TEXT("MR_Hip_R"), FLinearColor(1.f, 0.45f, 0.f)},          // orange
			{TEXT("MR_Hand_R_Grip"), FLinearColor(1.f, 1.f, 1.f)},      // white
			{TEXT("MR_Hand_L_Grip"), FLinearColor(0.5f, 0.f, 0.8f)}};   // purple
		const FLinearColor* F = Map.Find(Id); return F ? *F : FLinearColor::Gray;
	}
}

AMRAnimationTestDriver::AMRAnimationTestDriver()
{
	PrimaryActorTick.bCanEverTick = true;
	PrimaryActorTick.bStartWithTickEnabled = true;
}

void AMRAnimationTestDriver::BeginPlay()
{
	Super::BeginPlay();

	const bool bCmd = FParse::Param(FCommandLine::Get(), TEXT("MRAnimTest"));
	if (!(bAutoRun || bCmd))
	{
		SetActorTickEnabled(false);
		return;
	}
	if (FParse::Param(FCommandLine::Get(), TEXT("MRAnimTestKeepOpen")))
	{
		bQuitWhenDone = false;
	}

	bRunning = true;
	BodyIndex = 0;
	Phase = EPhase::Wait;
	PhaseTime = 0.f;
	UE_LOG(LogMoonRacer, Display, TEXT("MRTEST|BEGIN|engine=%s"), *FEngineVersion::Current().ToString());
	for (TObjectIterator<ULightComponentBase> It; It; ++It)
	{
		if (It->GetWorld() != GetWorld()) continue;
		UE_LOG(LogMoonRacer, Display, TEXT("MRTEST|LIGHT|%s|owner=%s|intensity=%.3f|visible=%d|mobility=%d|castShadows=%d"), *It->GetClass()->GetName(), It->GetOwner() ? *It->GetOwner()->GetName() : TEXT("-"), It->Intensity, It->IsVisible(), (int32)It->Mobility.GetValue(), It->CastShadows);
	}
	for (TObjectIterator<USkyAtmosphereComponent> It; It; ++It) { if (It->GetWorld() == GetWorld()) UE_LOG(LogMoonRacer, Display, TEXT("MRTEST|SKYATMO|present")); }
}

void AMRAnimationTestDriver::Check(const FString& Name, bool bPassed, const FString& Detail)
{
	(bPassed ? NumPass : NumFail)++;
	UE_LOG(LogMoonRacer, Display, TEXT("MRTEST|CHECK|%s|%s|%s"), bPassed ? TEXT("PASS") : TEXT("FAIL"), *Name, *Detail);
}

void AMRAnimationTestDriver::Shot(const FString& Name)
{
	// Diagnostic: render the scene off-screen (independent of the window back buffer) and export it.
	if (FParse::Param(FCommandLine::Get(), TEXT("MRSceneCapture")) && Pawn.IsValid())
	{
		UTextureRenderTarget2D* RT = UKismetRenderingLibrary::CreateRenderTarget2D(this, 1280, 720, RTF_RGBA8, FLinearColor::Black, false);
		USceneCaptureComponent2D* Cap = NewObject<USceneCaptureComponent2D>(this, NAME_None, RF_Transient);
		Cap->TextureTarget = RT;
		FString SrcName = TEXT("FinalColorLDR"); FParse::Value(FCommandLine::Get(), TEXT("MRCaptureSource="), SrcName);
		Cap->CaptureSource = SrcName == TEXT("BaseColor") ? SCS_BaseColor : SrcName == TEXT("SceneColorHDR") ? SCS_SceneColorHDR : SrcName == TEXT("Normal") ? SCS_Normal : SrcName == TEXT("SceneColorHDRNoAlpha") ? SCS_SceneColorHDRNoAlpha : SCS_FinalColorLDR;
		Cap->bCaptureEveryFrame = false;
		Cap->bCaptureOnMovement = false;
		Cap->RegisterComponent();
		const FVector Target = Pawn->GetActorLocation();
		const FVector CamLoc = Target + FVector(0.f, -420.f, 30.f);
		Cap->SetWorldLocationAndRotation(CamLoc, UKismetMathLibrary::FindLookAtRotation(CamLoc, Target));
		Cap->CaptureScene();
		UKismetRenderingLibrary::ExportRenderTarget(this, RT, FPaths::ProjectSavedDir() / TEXT("Screenshots/SceneCapture"), FString::Printf(TEXT("MRSC_%s_%s.hdr"), *SrcName, *Name));
		UE_LOG(LogMoonRacer, Display, TEXT("MRTEST|SCENECAPTURE|%s"), *Name);
		Cap->DestroyComponent();
	}
	if (bTakeScreenshots)
	{
		FScreenshotRequest::RequestScreenshot(FString::Printf(TEXT("MRAnimTest_%s"), *Name), false, true);
		UE_LOG(LogMoonRacer, Display, TEXT("MRTEST|SHOT|%s"), *Name);
	}
}

float AMRAnimationTestDriver::ReadFloatVar(const TCHAR* Name, bool& bFound) const
{
	bFound = false;
	const AMRPlayerCharacter* P = Pawn.Get();
	UAnimInstance* Anim = (P && P->GetMesh()) ? P->GetMesh()->GetAnimInstance() : nullptr;
	if (!Anim) return 0.f;
	if (FProperty* Prop = Anim->GetClass()->FindPropertyByName(Name))
	{
		if (const FNumericProperty* Num = CastField<FNumericProperty>(Prop))
		{
			bFound = true;
			return (float)Num->GetFloatingPointPropertyValue(Prop->ContainerPtrToValuePtr<void>(Anim));
		}
	}
	return 0.f;
}

bool AMRAnimationTestDriver::ReadBoolVar(const TCHAR* Name, bool& bFound) const
{
	bFound = false;
	const AMRPlayerCharacter* P = Pawn.Get();
	UAnimInstance* Anim = (P && P->GetMesh()) ? P->GetMesh()->GetAnimInstance() : nullptr;
	if (!Anim) return false;
	if (FProperty* Prop = Anim->GetClass()->FindPropertyByName(Name))
	{
		if (const FBoolProperty* B = CastField<FBoolProperty>(Prop))
		{
			bFound = true;
			return B->GetPropertyValue_InContainer(Anim);
		}
	}
	return false;
}

FString AMRAnimationTestDriver::StateNames() const
{
	const AMRPlayerCharacter* P = Pawn.Get();
	UAnimInstance* Anim = (P && P->GetMesh()) ? P->GetMesh()->GetAnimInstance() : nullptr;
	if (!Anim) return TEXT("<no anim instance>");

	FString Out;
	// Probe the state machines by name and by index (names come from the Animation Blueprint).
	for (const TCHAR* MachineName : { TEXT("Locomotion"), TEXT("Main States") })
	{
		const int32 Idx = Anim->GetStateMachineIndex(FName(MachineName));
		if (Idx != INDEX_NONE)
		{
			Out += FString::Printf(TEXT("%s=%s;"), MachineName, *Anim->GetCurrentStateName(Idx).ToString());
		}
	}
	return Out.IsEmpty() ? TEXT("<no state machine found by name>") : Out;
}

void AMRAnimationTestDriver::SampleAndLog(const TCHAR* Tag)
{
	AMRPlayerCharacter* P = Pawn.Get();
	if (!P) return;
	const float Speed = P->GetVelocity().Size2D();
	const float ZVel = P->GetVelocity().Z;
	bool bF1, bF2, bF3, bF4;
	const float GroundSpeed = ReadFloatVar(TEXT("GroundSpeed"), bF1);
	const bool bShouldMove = ReadBoolVar(TEXT("ShouldMove"), bF2);
	const bool bIsFalling = ReadBoolVar(TEXT("IsFalling"), bF3);
	const float Direction = ReadFloatVar(TEXT("Direction"), bF4);
	const FString States = StateNames();
	StatesSeen.Add(States);
	UE_LOG(LogMoonRacer, Display,
		TEXT("MRTEST|SAMPLE|body=%d|%s|t=%.2f|pawnSpeed=%.1f|zVel=%.1f|moveFalling=%d|abp.GroundSpeed=%s%.1f|abp.ShouldMove=%s%d|abp.IsFalling=%s%d|abp.Direction=%s%.1f|states=%s|accel=%.1f|lastInput=%.2f|ignoreMove=%d|mode=%d|yaw=%.1f|x=%.1f|cmcVel=%.1f|maxSpeed=%.1f|analogMod=%.2f|jt=%d|floor=%d|rmMode=%d|hasRM=%d|cmcAnimRM=%d|vel3=%s|z=%.2f"),
		BodyIndex, Tag, PhaseTime, Speed, ZVel, P->GetCharacterMovement()->IsFalling(),
		bF1 ? TEXT("") : TEXT("(n/a)"), GroundSpeed, bF2 ? TEXT("") : TEXT("(n/a)"), bShouldMove,
		bF3 ? TEXT("") : TEXT("(n/a)"), bIsFalling, bF4 ? TEXT("") : TEXT("(n/a)"), Direction, *States,
		P->GetCharacterMovement()->GetCurrentAcceleration().Size(), P->GetLastMovementInputVector().Size(),
		P->GetController() ? P->GetController()->IsMoveInputIgnored() : -1, (int32)P->GetCharacterMovement()->MovementMode.GetValue(), P->GetActorRotation().Yaw,
		P->GetActorLocation().X, P->GetCharacterMovement()->Velocity.Size(), P->GetCharacterMovement()->GetMaxSpeed(), P->GetCharacterMovement()->GetAnalogInputModifier(), P->GetCharacterMovement()->bJustTeleported, P->GetCharacterMovement()->CurrentFloor.IsWalkableFloor(),
		P->GetMesh()->GetAnimInstance() ? (int32)P->GetMesh()->GetAnimInstance()->RootMotionMode.GetValue() : -1, P->GetMesh()->GetAnimInstance() ? P->GetMesh()->GetAnimInstance()->GetRootMotionMontageInstance() != nullptr : -1, P->GetCharacterMovement()->HasAnimRootMotion(), *P->GetCharacterMovement()->Velocity.ToCompactString(), P->GetActorLocation().Z);
}


void AMRAnimationTestDriver::AttachTinted(AMRPlayerCharacter* P, const FMRAttachmentPointDef& Def, int32 ShapeIndex, int32& Count)
{
	static const TCHAR* Shapes[] = { TEXT("/Engine/BasicShapes/Cube.Cube"), TEXT("/Engine/BasicShapes/Sphere.Sphere"), TEXT("/Engine/BasicShapes/Cylinder.Cylinder") };
	if (UStaticMeshComponent* Comp = P->AttachRigidAccessory(Def.PointId, LoadObject<UStaticMesh>(nullptr, Shapes[ShapeIndex % 3]), FVector(0.1f)))
	{
		if (UMaterialInterface* Base = LoadObject<UMaterialInterface>(nullptr, TEXT("/Engine/BasicShapes/BasicShapeMaterial.BasicShapeMaterial")))
		{
			UMaterialInstanceDynamic* MID = UMaterialInstanceDynamic::Create(Base, Comp);
			MID->SetVectorParameterValue(TEXT("Color"), PointColor(Def.PointId));
			Comp->SetMaterial(0, MID);
		}
		Count++;
	}
}

void AMRAnimationTestDriver::UpdateAccessoryError()
{
	AMRPlayerCharacter* P = Pawn.Get();
	if (!P) return;
	for (const TPair<FName, TObjectPtr<UStaticMeshComponent>>& Pair : P->GetAccessories())
	{
		FTransform Expected;
		if (Pair.Value && P->GetExpectedAccessoryTransform(Pair.Key, Expected))
		{
			const float Err = FVector::Dist(Expected.GetLocation(), Pair.Value->GetComponentLocation());
			MaxAccessoryError = FMath::Max(MaxAccessoryError, Err);
		}
	}
}

void AMRAnimationTestDriver::OnPawnHit(UPrimitiveComponent* HitComp, AActor* Other, UPrimitiveComponent* OtherComp, FVector NormalImpulse, const FHitResult& Hit)
{
	if (HitLogCount++ < 12)
	{
		UE_LOG(LogMoonRacer, Display, TEXT("MRTEST|HIT|phase=%d|t=%.2f|other=%s|comp=%s|normal=%s|depth=%.2f|startPen=%d"), (int32)Phase, PhaseTime, Other ? *Other->GetName() : TEXT("-"), OtherComp ? *OtherComp->GetName() : TEXT("-"), *Hit.ImpactNormal.ToCompactString(), Hit.PenetrationDepth, Hit.bStartPenetrating);
	}
}

void AMRAnimationTestDriver::OnPawnLanded(const FHitResult& Hit)
{
	bLanded = true;
	LandedAtPhaseTime = PhaseTime;
	UE_LOG(LogMoonRacer, Display, TEXT("MRTEST|EVENT|Landed|body=%d|t=%.2f"), BodyIndex, PhaseTime);
}

void AMRAnimationTestDriver::BeginPhase(EPhase NewPhase)
{
	Phase = NewPhase;
	PhaseTime = 0.f;
	LogAccum = 0.f;
	MaxSpeed = 0.f;
	MinSpeed = 1e9f;
	MaxZVel = 0.f;
	bSawFalling = false;
	bLanded = false;
	bJumpRequested = false;
	LandedAtPhaseTime = -1.f;
	bShotAirborne = false;
	bShotFall = false;
	bShotLand = false;
	TuneStep = 0;
	bTuneRot = false;
	StatesSeen.Empty();

	AMRPlayerCharacter* P = Pawn.Get();
	if (P && !FParse::Param(FCommandLine::Get(), TEXT("MRNoTeleport")))
	{
		// reset to the start pose of the course between phases
		P->SetActorLocationAndRotation(StartLocation, StartRotation, false, nullptr, ETeleportType::TeleportPhysics);
		P->GetCharacterMovement()->StopMovementImmediately();
	}
	static const TCHAR* Names[] = { TEXT("Wait"), TEXT("Idle"), TEXT("Walk"), TEXT("Jog"), TEXT("Jump"), TEXT("AccIdle"), TEXT("AccWalk"), TEXT("AccJog"), TEXT("AccJump"), TEXT("Materials"), TEXT("Tune"), TEXT("NextBody"), TEXT("Finish"), TEXT("Done") };
	UE_LOG(LogMoonRacer, Display, TEXT("MRTEST|PHASE|body=%d|%s"), BodyIndex, Names[(int32)NewPhase]);
}

void AMRAnimationTestDriver::FinishRun()
{
	UE_LOG(LogMoonRacer, Display, TEXT("MRTEST|RESULT|%s|pass=%d|fail=%d"), NumFail == 0 ? TEXT("PASS") : TEXT("FAIL"), NumPass, NumFail);
	if (bQuitWhenDone)
	{
		UKismetSystemLibrary::QuitGame(this, UGameplayStatics::GetPlayerController(this, 0), EQuitPreference::Quit, false);
	}
}

void AMRAnimationTestDriver::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	if (!bRunning || Phase == EPhase::Done) return;

	PhaseTime += DeltaSeconds;
	LogAccum += DeltaSeconds;

	if (!Pawn.IsValid())
	{
		AMRPlayerCharacter* Found = Cast<AMRPlayerCharacter>(UGameplayStatics::GetPlayerPawn(this, 0));
		if (!Found)
		{
			if (PhaseTime > 10.f)
			{
				Check(TEXT("PlayerPawnIsAMRPlayerCharacter"), false, TEXT("no AMRPlayerCharacter possessed after 10s"));
				bRunning = false;
				Phase = EPhase::Done;
				FinishRun();
			}
			return;
		}
		Pawn = Found;
		StartLocation = Found->GetActorLocation();
		StartRotation = Found->GetActorRotation();
		Found->LandedDelegate.AddDynamic(this, &AMRAnimationTestDriver::OnPawnLanded);
		Found->GetCapsuleComponent()->OnComponentHit.AddDynamic(this, &AMRAnimationTestDriver::OnPawnHit);
		// Side-on camera for readable screenshots.
		if (APlayerController* PC = UGameplayStatics::GetPlayerController(this, 0))
		{
			PC->SetControlRotation(FRotator(-8.f, StartRotation.Yaw + 90.f, 0.f));
		}
		Check(TEXT("PlayerPawnIsAMRPlayerCharacter"), true, Found->GetClass()->GetName());
		Check(TEXT("PlaceholderBodyFlagged"), Found->bDevPlaceholderBody, TEXT("bDevPlaceholderBody"));
		BeginPhase(EPhase::Wait);
	}

	AMRPlayerCharacter* P = Pawn.Get();
	const float Speed = P->GetVelocity().Size2D();
	MaxSpeed = FMath::Max(MaxSpeed, Speed);
	MinSpeed = FMath::Min(MinSpeed, Speed);
	MaxZVel = FMath::Max(MaxZVel, P->GetVelocity().Z);
	if (P->GetCharacterMovement()->IsFalling()) bSawFalling = true;

	const bool bAccPhase = (Phase >= EPhase::AccessoryIdle && Phase <= EPhase::AccessoryJump);
	if (bAccPhase) UpdateAccessoryError();

	if (LogAccum >= 0.25f)
	{
		LogAccum = 0.f;
		SampleAndLog(*FString::Printf(TEXT("p%d"), (int32)Phase));
		StatesSeen.Add(StateNames());
	}

	switch (Phase)
	{
	case EPhase::Wait:
	{
		if (PhaseTime < 0.5f) break;
		if (!P->SetDevBodyMesh(BodyIndex))
		{
			Check(FString::Printf(TEXT("SetDevBodyMesh[%d]"), BodyIndex), false, TEXT("failed"));
			BeginPhase(EPhase::Finish);
			break;
		}
		// settle so the animation instance is created and evaluated
		if (PhaseTime < 1.5f) break;
		USkeletalMeshComponent* M = P->GetMesh();
		const FString MeshName = M->GetSkeletalMeshAsset() ? M->GetSkeletalMeshAsset()->GetName() : TEXT("<none>");
		const USkeleton* Skel = M->GetSkeletalMeshAsset() ? M->GetSkeletalMeshAsset()->GetSkeleton() : nullptr;
		const FString SkelPath = Skel ? Skel->GetPathName() : TEXT("<none>");
		Check(FString::Printf(TEXT("Body%d_MeshLoaded"), BodyIndex), M->GetSkeletalMeshAsset() != nullptr, MeshName);
		Check(FString::Printf(TEXT("Body%d_SharedSkeleton"), BodyIndex), SkelPath.Contains(TEXT("SK_Mannequin")), SkelPath);
		Check(FString::Printf(TEXT("Body%d_AnimInstanceCreated"), BodyIndex), M->GetAnimInstance() != nullptr, M->GetAnimInstance() ? M->GetAnimInstance()->GetClass()->GetName() : TEXT("<none>"));
		bool bGs, bSm, bIf;
		ReadFloatVar(TEXT("GroundSpeed"), bGs); ReadBoolVar(TEXT("ShouldMove"), bSm); ReadBoolVar(TEXT("IsFalling"), bIf);
		Check(FString::Printf(TEXT("Body%d_AbpVariablesPresent"), BodyIndex), bGs && bSm && bIf, FString::Printf(TEXT("GroundSpeed=%d ShouldMove=%d IsFalling=%d"), bGs, bSm, bIf));

		{
			// Skeleton / bone / socket evidence (runtime, from the loaded asset).
			static const TCHAR* RequiredBones[] = { TEXT("root"), TEXT("pelvis"), TEXT("spine_02"), TEXT("spine_04"), TEXT("neck_02"), TEXT("head"), TEXT("hand_r"), TEXT("hand_l"), TEXT("foot_l"), TEXT("foot_r"), TEXT("ik_foot_root"), TEXT("ik_hand_root"), TEXT("interaction") };
			FString Missing;
			for (const TCHAR* B : RequiredBones) { if (M->GetBoneIndex(FName(B)) == INDEX_NONE) Missing += FString(B) + TEXT(" "); }
			Check(FString::Printf(TEXT("Body%d_RequiredBonesPresent"), BodyIndex), Missing.IsEmpty(), FString::Printf(TEXT("numBones=%d missing=[%s]"), M->GetNumBones(), *Missing));
			FString SockList;
			for (const FName& SN : M->GetAllSocketNames()) { SockList += SN.ToString() + TEXT(","); }
			UE_LOG(LogMoonRacer, Display, TEXT("MRTEST|INFO|body=%d|sockets=%s"), BodyIndex, *SockList);
			if (P->AttachmentPoints)
			{
				for (const FMRAttachmentPointDef& Def : P->AttachmentPoints->Points)
				{
					const FTransform BoneW = M->GetSocketTransform(Def.BoneName, RTS_World);
					const FTransform ActorT = P->GetActorTransform();
					UE_LOG(LogMoonRacer, Display, TEXT("MRTEST|AXIS|body=%d|%s|bone=%s|boneX_inActor=%s|boneY_inActor=%s|boneZ_inActor=%s|boneLoc_inActor=%s"),
						BodyIndex, *Def.PointId.ToString(), *Def.BoneName.ToString(),
						*ActorT.InverseTransformVectorNoScale(BoneW.GetUnitAxis(EAxis::X)).ToCompactString(),
						*ActorT.InverseTransformVectorNoScale(BoneW.GetUnitAxis(EAxis::Y)).ToCompactString(),
						*ActorT.InverseTransformVectorNoScale(BoneW.GetUnitAxis(EAxis::Z)).ToCompactString(),
						*ActorT.InverseTransformPosition(BoneW.GetLocation()).ToCompactString());
				}
			}
		}
		{
			// A body swap must not inherit the previous body's material overrides.
			bool bDefaults = M->GetSkeletalMeshAsset() != nullptr;
			if (bDefaults)
			{
				const TArray<FSkeletalMaterial>& Mats = M->GetSkeletalMeshAsset()->GetMaterials();
				for (int32 i = 0; i < Mats.Num(); ++i) { if (M->GetMaterial(i) != Mats[i].MaterialInterface) bDefaults = false; }
			}
			Check(FString::Printf(TEXT("Body%d_DefaultMaterialsAfterSwap"), BodyIndex), bDefaults, FString::Printf(TEXT("slot0=%s"), M->GetMaterial(0) ? *M->GetMaterial(0)->GetName() : TEXT("-")));
		}
		const FString StatesNow = StateNames();
		Check(FString::Printf(TEXT("Body%d_StateMachineFound"), BodyIndex), !StatesNow.StartsWith(TEXT("<")), StatesNow);
		if (FParse::Param(FCommandLine::Get(), TEXT("MRAttachTune")))
		{
			int32 N2 = 0; int32 Att = 0;
			if (P->AttachmentPoints)
			{
				for (const FMRAttachmentPointDef& Def : P->AttachmentPoints->Points) { AttachTinted(P, Def, N2++, Att); }
			}
			float Dist = 260.f; FParse::Value(FCommandLine::Get(), TEXT("MRCamDist="), Dist);
			P->GetCameraBoom()->TargetArmLength = Dist;
			float CamZ = 20.f; FParse::Value(FCommandLine::Get(), TEXT("MRCamZ="), CamZ);
			P->GetCameraBoom()->SocketOffset = FVector(0.f, 0.f, CamZ);
			UE_LOG(LogMoonRacer, Display, TEXT("MRTEST|TUNE|body=%d|attached=%d"), BodyIndex, Att);
			BeginPhase(EPhase::Tune);
			break;
		}
		Shot(FString::Printf(TEXT("Body%d_Idle"), BodyIndex));
		BeginPhase(EPhase::Idle);
		break;
	}
	case EPhase::Idle:
		if (PhaseTime >= 2.0f)
		{
			bool bGs; const float G = ReadFloatVar(TEXT("GroundSpeed"), bGs);
			bool bSm; const bool Sm = ReadBoolVar(TEXT("ShouldMove"), bSm);
			Check(FString::Printf(TEXT("Body%d_Idle"), BodyIndex), MaxSpeed < 5.f && (!bGs || G < 5.f) && (!bSm || !Sm), FString::Printf(TEXT("pawnMax=%.1f abpGround=%.1f shouldMove=%d states=%s"), MaxSpeed, G, Sm, *StateNames()));
			BeginPhase(EPhase::Walk);
		}
		break;
	case EPhase::Walk:
		P->AddMovementInput(P->GetActorForwardVector(), WalkInputValue());
		if (PhaseTime >= 3.0f)
		{
			bool bGs; const float G = ReadFloatVar(TEXT("GroundSpeed"), bGs);
			bool bSm; const bool Sm = ReadBoolVar(TEXT("ShouldMove"), bSm);
			const bool bOk = MaxSpeed > 250.f && MaxSpeed < 360.f && (!bSm || Sm);
			Check(FString::Printf(TEXT("Body%d_Walk"), BodyIndex), bOk, FString::Printf(TEXT("pawnMax=%.1f abpGround=%.1f shouldMove=%d states=%s"), MaxSpeed, G, Sm, *StateNames()));
			Shot(FString::Printf(TEXT("Body%d_Walk"), BodyIndex));
			if (FParse::Param(FCommandLine::Get(), TEXT("MRStopAfterWalk"))) { Phase = EPhase::Done; bRunning = false; FinishRun(); break; }
			BeginPhase(EPhase::Jog);
		}
		break;
	case EPhase::Jog:
		P->AddMovementInput(P->GetActorForwardVector(), JogInput);
		if (PhaseTime >= 3.0f)
		{
			bool bGs; const float G = ReadFloatVar(TEXT("GroundSpeed"), bGs);
			bool bSm; const bool Sm = ReadBoolVar(TEXT("ShouldMove"), bSm);
			Check(FString::Printf(TEXT("Body%d_Jog"), BodyIndex), MaxSpeed > 520.f && (!bSm || Sm), FString::Printf(TEXT("pawnMax=%.1f abpGround=%.1f shouldMove=%d states=%s"), MaxSpeed, G, Sm, *StateNames()));
			Shot(FString::Printf(TEXT("Body%d_Jog"), BodyIndex));
			BeginPhase(EPhase::Jump);
		}
		break;
	case EPhase::Jump:
	case EPhase::AccessoryJump:
	{
		if (PhaseTime > 0.5f && !bJumpRequested)
		{
			bJumpRequested = true;
			JumpStartTime = PhaseTime;
			P->Jump();
		}
		if (bJumpRequested && P->GetCharacterMovement()->IsFalling() && !bShotAirborne && P->GetVelocity().Z < 100.f)
		{
			bShotAirborne = true;
			Shot(FString::Printf(TEXT("Body%d_%s_Airborne"), BodyIndex, Phase == EPhase::Jump ? TEXT("Jump") : TEXT("AccJump")));
		}
		if (bJumpRequested && !bShotFall && P->GetCharacterMovement()->IsFalling() && P->GetVelocity().Z < -150.f)
		{
			bShotFall = true;
			Shot(FString::Printf(TEXT("Body%d_%s_Falling"), BodyIndex, Phase == EPhase::Jump ? TEXT("Jump") : TEXT("AccJump")));
		}
		if (bLanded && !bShotLand && (PhaseTime - LandedAtPhaseTime) > 0.10f)
		{
			bShotLand = true;
			Shot(FString::Printf(TEXT("Body%d_%s_Landing"), BodyIndex, Phase == EPhase::Jump ? TEXT("Jump") : TEXT("AccJump")));
		}
		const bool bFinished = bJumpRequested && bLanded && (PhaseTime - LandedAtPhaseTime) > 1.2f;
		if (bFinished || PhaseTime > 6.f)
		{
			bool bIf; const bool IsFall = ReadBoolVar(TEXT("IsFalling"), bIf);
			bool bAnyFallState = false;
			for (const FString& S : StatesSeen) { if (S.Contains(TEXT("Fall")) || S.Contains(TEXT("Jump")) || S.Contains(TEXT("Land"))) bAnyFallState = true; }
			if (Phase == EPhase::Jump)
			{
				Check(FString::Printf(TEXT("Body%d_JumpLeftGround"), BodyIndex), bSawFalling && MaxZVel > 200.f, FString::Printf(TEXT("maxZVel=%.1f sawFalling=%d"), MaxZVel, bSawFalling));
				Check(FString::Printf(TEXT("Body%d_Landed"), BodyIndex), bLanded, FString::Printf(TEXT("landedAt=%.2f"), LandedAtPhaseTime));
				Check(FString::Printf(TEXT("Body%d_ReturnedToGround"), BodyIndex), bLanded && !P->GetCharacterMovement()->IsFalling() && (!bIf || !IsFall), FString::Printf(TEXT("moveFalling=%d abpIsFalling=%d states=%s"), P->GetCharacterMovement()->IsFalling(), IsFall, *StateNames()));
				// Distinct locomotion state observed during airtime proves the state machine transitioned.
				Check(FString::Printf(TEXT("Body%d_AirStateTransition"), BodyIndex), bAnyFallState, FString::Printf(TEXT("statesSeen=%d"), StatesSeen.Num()));
				// attach accessories for the next phases
				AccessoryCount = 0;
				if (P->AttachmentPoints)
				{
					int32 N = 0;
					for (const FMRAttachmentPointDef& Def : P->AttachmentPoints->Points) { AttachTinted(P, Def, N++, AccessoryCount); }
				}
				Check(FString::Printf(TEXT("Body%d_AccessoriesAttached"), BodyIndex), P->AttachmentPoints && AccessoryCount == P->AttachmentPoints->Points.Num() && AccessoryCount > 0, FString::Printf(TEXT("attached=%d"), AccessoryCount));
				MaxAccessoryError = 0.f;
				BeginPhase(EPhase::AccessoryIdle);
			}
			else
			{
				Check(FString::Printf(TEXT("Body%d_AccessoryAlignment"), BodyIndex), AccessoryCount > 0 && MaxAccessoryError < AccessoryTolerance, FString::Printf(TEXT("maxError=%.3fcm tol=%.1fcm points=%d"), MaxAccessoryError, AccessoryTolerance, AccessoryCount));
				BeginPhase(EPhase::Materials);
			}
		}
		break;
	}
	case EPhase::AccessoryIdle:
		if (PhaseTime >= 1.5f) { Shot(FString::Printf(TEXT("Body%d_AccIdle"), BodyIndex)); BeginPhase(EPhase::AccessoryWalk); }
		break;
	case EPhase::AccessoryWalk:
		P->AddMovementInput(P->GetActorForwardVector(), WalkInputValue());
		if (PhaseTime >= 2.5f) { Shot(FString::Printf(TEXT("Body%d_AccWalk"), BodyIndex)); BeginPhase(EPhase::AccessoryJog); }
		break;
	case EPhase::AccessoryJog:
		P->AddMovementInput(P->GetActorForwardVector(), JogInput);
		if (PhaseTime >= 2.5f) { Shot(FString::Printf(TEXT("Body%d_AccJog"), BodyIndex)); BeginPhase(EPhase::AccessoryJump); }
		break;
	case EPhase::Materials:
	{
		if (PhaseTime < 0.2f) break;
		USkeletalMeshComponent* M = P->GetMesh();
		const int32 Slots = M->GetNumMaterials();
		UMaterialInterface* Before = Slots > 0 ? M->GetMaterial(0) : nullptr;
		// Swap slot 0 to the other variant that ships with the same mesh, if present.
		const TCHAR* Alt = (BodyIndex == 0) ? TEXT("/Game/Characters/Mannequins/Materials/Manny/MI_Manny_02_New.MI_Manny_02_New")
		                                    : TEXT("/Game/Characters/Mannequins/Materials/Quinn/MI_Quinn_02.MI_Quinn_02");
		UMaterialInterface* AltMat = LoadObject<UMaterialInterface>(nullptr, Alt);
		const bool bSet = AltMat && P->SetBodyMaterial(0, AltMat);
		const bool bChanged = bSet && M->GetMaterial(0) == AltMat && M->GetMaterial(0) != Before;
		Check(FString::Printf(TEXT("Body%d_MaterialSwap"), BodyIndex), bChanged, FString::Printf(TEXT("slots=%d before=%s after=%s"), Slots, Before ? *Before->GetName() : TEXT("-"), M->GetMaterial(0) ? *M->GetMaterial(0)->GetName() : TEXT("-")));
		bool bBad = !P->SetBodyMaterial(999, AltMat);
		Check(FString::Printf(TEXT("Body%d_MaterialBadSlotRejected"), BodyIndex), bBad, TEXT("slot 999"));
		Shot(FString::Printf(TEXT("Body%d_MaterialSwap"), BodyIndex));
		BeginPhase(EPhase::NextBody);
		break;
	}
	case EPhase::Tune:
	{
		// 4 views around the standing character (control yaw +90 deg per view).
		if (TuneStep < 4)
		{
			const float T0 = 0.8f + 1.4f * TuneStep;
			if (!bTuneRot && PhaseTime > T0)
			{
				if (APlayerController* PC = UGameplayStatics::GetPlayerController(this, 0))
				{
					PC->SetControlRotation(FRotator(-5.f, StartRotation.Yaw + 90.f * (TuneStep + 1), 0.f));
				}
				bTuneRot = true;
			}
			else if (bTuneRot && PhaseTime > T0 + 0.7f)
			{
				Shot(FString::Printf(TEXT("Body%d_Tune_View%d"), BodyIndex, TuneStep));
				bTuneRot = false;
				TuneStep++;
			}
		}
		else if (PhaseTime > 0.8f + 1.4f * 4 + 0.3f)
		{
			BeginPhase(EPhase::NextBody);
		}
		break;
	}
	case EPhase::NextBody:
		if (PhaseTime < 0.6f) break;
		P->ClearAllAccessories();
		BodyIndex++;
		if (P->DevBodyMeshes.IsValidIndex(BodyIndex))
		{
			BeginPhase(EPhase::Wait);
		}
		else
		{
			// Unknown index must be rejected without crashing
			Check(TEXT("InvalidBodyIndexRejected"), !P->SetDevBodyMesh(BodyIndex), FString::Printf(TEXT("index %d"), BodyIndex));
			BeginPhase(EPhase::Finish);
		}
		break;
	case EPhase::Finish:
		if (PhaseTime >= 1.0f)
		{
			Phase = EPhase::Done;
			bRunning = false;
			FinishRun();
		}
		break;
	default:
		break;
	}
}
