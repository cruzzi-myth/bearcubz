#include "Dev/MRAvatarTestDriver.h"
#include "Avatar/MRAvatarCatalog.h"
#include "Avatar/MRAvatarCreatorWidget.h"
#include "Avatar/MRAvatarCustomizationComponent.h"
#include "Avatar/MRAvatarSaveGame.h"
#include "Humanoid/MRPlayerCharacter.h"
#include "Animation/AnimInstance.h"
#include "Components/SkeletalMeshComponent.h"
#include "Engine/GameInstance.h"
#include "Engine/SkeletalMesh.h"
#include "Engine/StaticMesh.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "Kismet/GameplayStatics.h"
#include "Kismet/KismetSystemLibrary.h"
#include "Materials/MaterialInterface.h"
#include "Misc/CommandLine.h"
#include "UnrealClient.h"
#include "Engine/GameViewportClient.h"
#include "Framework/Application/SlateApplication.h"
#include "Input/Events.h"
#include "Widgets/SWindow.h"
#include "GameFramework/SpringArmComponent.h"
#include "MoonRacer.h"

AMRAvatarTestDriver::AMRAvatarTestDriver()
{
	PrimaryActorTick.bCanEverTick = true;
}

AMRPlayerCharacter* AMRAvatarTestDriver::Pawn() const { return Cast<AMRPlayerCharacter>(UGameplayStatics::GetPlayerPawn(this, 0)); }

UMRAvatarCreatorWidget* AMRAvatarTestDriver::Widget() const
{
	AMRAvatarCreatorController* PC = Cast<AMRAvatarCreatorController>(UGameplayStatics::GetPlayerController(this, 0));
	return PC ? PC->GetCreatorWidget() : nullptr;
}

FString AMRAvatarTestDriver::PawnBodyName() const
{
	const AMRPlayerCharacter* P = Pawn();
	return (P && P->GetMesh() && P->GetMesh()->GetSkeletalMeshAsset()) ? P->GetMesh()->GetSkeletalMeshAsset()->GetName() : TEXT("<none>");
}

FString AMRAvatarTestDriver::PawnSkeletonName() const
{
	const AMRPlayerCharacter* P = Pawn();
	const USkeletalMesh* M = (P && P->GetMesh()) ? P->GetMesh()->GetSkeletalMeshAsset() : nullptr;
	return (M && M->GetSkeleton()) ? M->GetSkeleton()->GetName() : TEXT("<none>");
}

FString AMRAvatarTestDriver::PawnMaterialName(int32 Slot) const
{
	const AMRPlayerCharacter* P = Pawn();
	if (!P || !P->GetMesh() || Slot >= P->GetMesh()->GetNumMaterials()) return TEXT("<none>");
	const UMaterialInterface* M = P->GetMesh()->GetMaterial(Slot);
	return M ? M->GetName() : TEXT("<none>");
}

int32 AMRAvatarTestDriver::AccessoryCount() const
{
	const AMRPlayerCharacter* P = Pawn();
	return P ? P->GetAccessories().Num() : -1;
}

void AMRAvatarTestDriver::Check(const FString& Name, bool bPass, const FString& Detail)
{
	(bPass ? NumPass : NumFail)++;
	UE_LOG(LogMoonRacer, Display, TEXT("MRAVT|CHECK|%s|%s|%s"), bPass ? TEXT("PASS") : TEXT("FAIL"), *Name, *Detail);
}

void AMRAvatarTestDriver::Shot(const FString& Name)
{
	if (FParse::Param(FCommandLine::Get(), TEXT("MRNoShots"))) return;
	FScreenshotRequest::RequestScreenshot(FString::Printf(TEXT("MRAvatar_%s_%s"), *Mode, *Name), true, true); // true = include UMG
	UE_LOG(LogMoonRacer, Display, TEXT("MRAVT|SHOT|%s"), *Name);
}

void AMRAvatarTestDriver::Finish()
{
	UE_LOG(LogMoonRacer, Display, TEXT("MRAVT|RESULT|%s|%s|pass=%d|fail=%d"), *Mode, NumFail == 0 ? TEXT("PASS") : TEXT("FAIL"), NumPass, NumFail);
	UKismetSystemLibrary::QuitGame(this, UGameplayStatics::GetPlayerController(this, 0), EQuitPreference::Quit, false);
}

void AMRAvatarTestDriver::BeginPlay()
{
	Super::BeginPlay();
	if (!FParse::Value(FCommandLine::Get(), TEXT("MRAvatarTest="), Mode) || Mode.IsEmpty()) { SetActorTickEnabled(false); return; }
	if (UMRAvatarSaveSubsystem::GetSlotName() == TEXT("MRAvatar_Local"))
	{
		UE_LOG(LogMoonRacer, Error, TEXT("MRAVT|REFUSED|dev test mode needs a dedicated slot (-MRAvatarSlot=...); refusing to touch the default player slot"));
		SetActorTickEnabled(false); return;
	}
	if (Mode == TEXT("save")) BuildSave();
	else if (Mode == TEXT("load")) BuildLoad();
	else if (Mode == TEXT("robust")) BuildRobust();
	else if (Mode == TEXT("mouse")) BuildMouse();
	else if (Mode == TEXT("mouse_reopen")) BuildMouseReopen();
	else { SetActorTickEnabled(false); return; }
	bRunning = true;
	UE_LOG(LogMoonRacer, Display, TEXT("MRAVT|BEGIN|mode=%s|slot=%s"), *Mode, *UMRAvatarSaveSubsystem::GetSlotName());
}

void AMRAvatarTestDriver::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	if (!bRunning) return;
	if (Pending.IsSet()) { TickClick(); return; } // a click/scroll is in flight; hold the script until it completes
	if (bHoldForward) { if (AMRPlayerCharacter* P = Pawn()) P->AddMovementInput(P->GetActorForwardVector(), 1.0f); }
	StepTimer += DeltaSeconds;
	if (StepIndex >= Steps.Num()) { bRunning = false; Finish(); return; }
	if (StepTimer >= Steps[StepIndex].Delay)
	{
		StepTimer = 0.f;
		const int32 I = StepIndex++;
		Steps[I].Fn();
	}
}

// ---------------------------------------------------------------------------------------------------------------
void AMRAvatarTestDriver::BuildSave()
{
	auto Comp = [this]() -> UMRAvatarCustomizationComponent* { return Pawn() ? Pawn()->AvatarCustomization.Get() : nullptr; };
	auto SaveSys = [this]() -> UMRAvatarSaveSubsystem* { return GetGameInstance()->GetSubsystem<UMRAvatarSaveSubsystem>(); };

	Steps.Add({2.0f, [=, this]()
	{
		UMRAvatarCreatorWidget* W = Widget();
		Check(TEXT("CreatorWidgetCreated"), W != nullptr);
		Check(TEXT("PawnIsAvatarCharacter"), Pawn() != nullptr);
		Check(TEXT("FreshSlotHasNoSave"), !SaveSys()->HasSavedAppearance());
		if (!W || !Comp()) { Check(TEXT("Abort"), false, TEXT("no widget/component")); StepIndex = Steps.Num(); return; }
		Check(TEXT("DefaultSpeciesHuman"), Comp()->GetCurrentAppearance().SpeciesId == FName("human"));
		Check(TEXT("DefaultBodyIsManny"), PawnBodyName() == TEXT("SKM_Manny_Simple"), PawnBodyName());
		// Only options that exist are offered.
		for (const FName& S : MRAvatar::CanonicalSpeciesIds()) Check(FString::Printf(TEXT("SpeciesButton_%s"), *S.ToString()), W->HasButton(TEXT("species"), S));
		Check(TEXT("BodyButtons_MannyQuinn"), W->HasButton(TEXT("body"), TEXT("dev_manny")) && W->HasButton(TEXT("body"), TEXT("dev_quinn")));
		Check(TEXT("NoButtonForPendingHair"), !W->HasButton(TEXT("hair"), TEXT("signal-crop")));
		Check(TEXT("NoButtonForPendingAccessory"), !W->HasButton(TEXT("accessory"), TEXT("pendant")));
		Check(TEXT("DevAccessoryButtonPresent"), W->HasButton(TEXT("accessory"), TEXT("dev_marker_head_top")));
		Shot(TEXT("01_initial"));
	}});

	Steps.Add({0.8f, [=, this]()
	{
		Widget()->HandleAction(TEXT("species"), TEXT("alien"));
		Check(TEXT("Preview_SpeciesAlien"), Comp()->GetCurrentAppearance().SpeciesId == FName("alien"));
		Check(TEXT("Preview_NotCommitted"), Comp()->GetCommittedAppearance().SpeciesId != FName("alien"), TEXT("committed unchanged by preview"));
		Check(TEXT("Preview_NotSaved"), !SaveSys()->HasSavedAppearance());
		const FString SkelBefore = PawnSkeletonName();
		Widget()->HandleAction(TEXT("body"), TEXT("dev_quinn"));
		Check(TEXT("Preview_BodyQuinn"), PawnBodyName() == TEXT("SKM_Quinn_Simple"), PawnBodyName());
		Check(TEXT("Preview_SharedSkeleton"), PawnSkeletonName() == SkelBefore && SkelBefore == TEXT("SK_Mannequin"), SkelBefore + TEXT(" -> ") + PawnSkeletonName());
		Check(TEXT("Preview_AnimInstanceKept"), Pawn()->GetMesh()->GetAnimInstance() != nullptr);
		Widget()->HandleAction(TEXT("material"), TEXT("dev_alt"));
		Check(TEXT("Preview_MaterialAlt"), PawnMaterialName(0) == TEXT("MI_Quinn_02"), PawnMaterialName(0));
		Widget()->HandleAction(TEXT("accessory"), TEXT("dev_marker_head_top"));
		Widget()->HandleAction(TEXT("accessory"), TEXT("dev_marker_hand_r_grip"));
		Check(TEXT("Preview_TwoAccessories"), AccessoryCount() == 2, FString::FromInt(AccessoryCount()));
		Widget()->HandleAction(TEXT("rotate"), TEXT("right"));
		Widget()->HandleAction(TEXT("zoom"), TEXT("in"));
		Shot(TEXT("02_preview"));
	}});

	Steps.Add({0.6f, [=, this]()
	{
		// Invalid input must be rejected without changing anything.
		Snapshot = Comp()->GetCurrentAppearance(); SnapshotBody = PawnBodyName(); SnapshotMat = PawnMaterialName(0); SnapshotAcc = AccessoryCount();
		auto Unchanged = [&]() { return Comp()->GetCurrentAppearance() == Snapshot && PawnBodyName() == SnapshotBody && PawnMaterialName(0) == SnapshotMat && AccessoryCount() == SnapshotAcc; };
		Widget()->HandleAction(TEXT("body"), TEXT("bogus_body"));
		Check(TEXT("Invalid_UnknownBodyRejected"), Widget()->GetStatus().StartsWith(TEXT("Rejected")) && Unchanged(), Widget()->GetStatus());
		Widget()->HandleAction(TEXT("species"), TEXT("elf"));
		Check(TEXT("Invalid_UnknownSpeciesRejected"), Widget()->GetStatus().StartsWith(TEXT("Rejected")) && Unchanged());
		Widget()->HandleAction(TEXT("accessory"), TEXT("jetpack"));
		Check(TEXT("Invalid_UnknownAccessoryRejected"), Widget()->GetStatus().StartsWith(TEXT("Rejected")) && Unchanged());
		Widget()->HandleAction(TEXT("material"), TEXT("neon_flames"));
		Check(TEXT("Invalid_UnknownMaterialRejected"), Widget()->GetStatus().StartsWith(TEXT("Rejected")) && Unchanged());
		Widget()->HandleAction(TEXT("no_such_action"), NAME_None);
		Check(TEXT("Invalid_UnknownActionIgnored"), Unchanged());
		// Direct component calls with invalid appearances.
		FMRAvatarAppearance Bad = Snapshot; Bad.AccessoryIds = { FName("dev_marker_head_top"), FName("dev_marker_head_top") };
		Check(TEXT("Invalid_DuplicateAccessoryRejected"), !Comp()->PreviewAppearance(Bad).bApplied && Unchanged());
		Bad = Snapshot; Bad.SpeciesId = FName("robot");
		Check(TEXT("Invalid_BadSpeciesComponentRejected"), !Comp()->PreviewAppearance(Bad).bApplied && Unchanged());
		// Known canonical ID with no 3D asset: stored, flagged pending, nothing visible changes.
		FMRAvatarAppearance Pend = Snapshot; Pend.HairId = FName("signal-crop");
		const FMRAvatarApplyResult R = Comp()->PreviewAppearance(Pend);
		Check(TEXT("Pending_HairStoredButNotShown"), R.bApplied && R.SkippedPending.Contains(FName("signal-crop")) && PawnBodyName() == SnapshotBody && AccessoryCount() == SnapshotAcc);
		Comp()->PreviewAppearance(Snapshot); // restore
		Check(TEXT("Invalid_StateRestored"), Unchanged());
	}});

	Steps.Add({0.5f, [=, this]()
	{
		Widget()->HandleAction(TEXT("cancel"), NAME_None);
		Check(TEXT("Cancel_RevertedBody"), PawnBodyName() == TEXT("SKM_Manny_Simple"), PawnBodyName());
		Check(TEXT("Cancel_RevertedSpecies"), Comp()->GetCurrentAppearance().SpeciesId == FName("human"));
		Check(TEXT("Cancel_NoAccessories"), AccessoryCount() == 0);
		Check(TEXT("Cancel_MaterialDefault"), PawnMaterialName(0) == TEXT("MI_Manny_01_New"), PawnMaterialName(0));
		Check(TEXT("Cancel_NothingSaved"), !SaveSys()->HasSavedAppearance());
		Shot(TEXT("03_after_cancel"));
	}});

	Steps.Add({0.5f, [=, this]()
	{
		// The selection that will be confirmed and saved.
		Widget()->HandleAction(TEXT("species"), TEXT("mythraxian"));
		Widget()->HandleAction(TEXT("body"), TEXT("dev_quinn"));
		Widget()->HandleAction(TEXT("material"), TEXT("dev_alt"));
		Widget()->HandleAction(TEXT("accessory"), TEXT("dev_marker_head_top"));
		Widget()->HandleAction(TEXT("accessory"), TEXT("dev_marker_hand_r_grip"));
		Shot(TEXT("04_before_confirm"));
	}});

	Steps.Add({0.5f, [=, this]()
	{
		Widget()->HandleAction(TEXT("confirm"), NAME_None);
		Check(TEXT("Confirm_StatusSaved"), Widget()->GetStatus().Contains(TEXT("saved")), Widget()->GetStatus());
		Check(TEXT("Confirm_FileExists"), SaveSys()->HasSavedAppearance());
		Check(TEXT("Confirm_Committed"), Comp()->GetCommittedAppearance() == Comp()->GetCurrentAppearance());
		FMRAvatarLoadReport R; const FMRAvatarAppearance L = SaveSys()->LoadAppearance(R);
		Check(TEXT("Confirm_SavedMatchesCurrent"), L == Comp()->GetCurrentAppearance(), L.ToJsonString());
		Check(TEXT("Confirm_RevisionIncremented"), L.Revision >= 2, FString::FromInt(L.Revision));
		Shot(TEXT("05_confirmed"));
	}});

	Steps.Add({0.5f, [=, this]()
	{
		const FMRAvatarAppearance Saved = Comp()->GetCommittedAppearance();
		Widget()->HandleAction(TEXT("reset"), NAME_None);
		Check(TEXT("Reset_DefaultsAppliedAsPreview"), Comp()->GetCurrentAppearance().BodyBaseId == FName("dev_manny") && AccessoryCount() == 0 && Comp()->GetCurrentAppearance().SpeciesId == FName("human"));
		Check(TEXT("Reset_DidNotOverwriteSave"), Comp()->GetCommittedAppearance() == Saved);
		Widget()->HandleAction(TEXT("cancel"), NAME_None);
		Check(TEXT("Cancel_RestoresSavedAfterReset"), Comp()->GetCurrentAppearance() == Saved && PawnBodyName() == TEXT("SKM_Quinn_Simple") && AccessoryCount() == 2);
	}});

	Steps.Add({0.8f, [this]() { Finish(); }});
}

// ---------------------------------------------------------------------------------------------------------------
void AMRAvatarTestDriver::BuildLoad()
{
	Steps.Add({2.0f, [this]()
	{
		AMRPlayerCharacter* P = Pawn();
		UMRAvatarSaveSubsystem* Save = GetGameInstance()->GetSubsystem<UMRAvatarSaveSubsystem>();
		Check(TEXT("Relaunch_SaveFilePersisted"), Save->HasSavedAppearance());
		Check(TEXT("Spawn_PawnValid"), P != nullptr);
		if (!P || !P->AvatarCustomization) { Check(TEXT("Abort"), false); StepIndex = Steps.Num(); return; }
		const FMRAvatarAppearance& A = P->AvatarCustomization->GetCurrentAppearance();
		Check(TEXT("Load_SpeciesMythraxian"), A.SpeciesId == FName("mythraxian"), A.SpeciesId.ToString());
		Check(TEXT("Load_BodyQuinn"), A.BodyBaseId == FName("dev_quinn") && PawnBodyName() == TEXT("SKM_Quinn_Simple"), PawnBodyName());
		Check(TEXT("Load_MaterialAlt"), A.MaterialVariantId == FName("dev_alt") && PawnMaterialName(0) == TEXT("MI_Quinn_02"), PawnMaterialName(0));
		Check(TEXT("Load_TwoAccessories"), AccessoryCount() == 2 && P->GetAccessory(FName("MR_Head_Top")) && P->GetAccessory(FName("MR_Hand_R_Grip")), FString::FromInt(AccessoryCount()));
		Check(TEXT("Load_SharedSkeleton"), PawnSkeletonName() == TEXT("SK_Mannequin"), PawnSkeletonName());
		Check(TEXT("Load_CommittedEqualsCurrent"), P->AvatarCustomization->GetCommittedAppearance() == A);
		Check(TEXT("Load_AnimInstanceAlive"), P->GetMesh()->GetAnimInstance() != nullptr);
		Shot(TEXT("01_spawned"));
	}});
	// The loaded avatar must still run through the shared humanoid animation foundation.
	Steps.Add({0.1f, [this]() { bHoldForward = true; }});
	Steps.Add({1.6f, [this]() {}});
	Steps.Add({0.1f, [this]()
	{
		AMRPlayerCharacter* P = Pawn();
		const float Speed = P ? P->GetVelocity().Size2D() : 0.f;
		float AbpGround = -1.f;
		if (P && P->GetMesh() && P->GetMesh()->GetAnimInstance())
			if (FProperty* Prop = P->GetMesh()->GetAnimInstance()->GetClass()->FindPropertyByName(TEXT("GroundSpeed")))
				if (const FNumericProperty* N = CastField<FNumericProperty>(Prop)) AbpGround = (float)N->GetFloatingPointPropertyValue(Prop->ContainerPtrToValuePtr<void>(P->GetMesh()->GetAnimInstance()));
		Check(TEXT("Loaded_AvatarMovesAndAnimates"), Speed > 450.f && AbpGround > 450.f, FString::Printf(TEXT("speed=%.0f abpGroundSpeed=%.0f"), Speed, AbpGround));
		Check(TEXT("Loaded_AccessoriesStillAttached"), AccessoryCount() == 2);
		Shot(TEXT("02_running"));
		bHoldForward = false;
	}});
	Steps.Add({0.8f, [this]() { Finish(); }});
}

// ---------------------------------------------------------------------------------------------------------------
void AMRAvatarTestDriver::BuildRobust()
{
	Steps.Add({1.5f, [this]()
	{
		AMRPlayerCharacter* P = Pawn();
		if (!P || !P->AvatarCustomization) { Check(TEXT("Abort"), false); StepIndex = Steps.Num(); return; }
		UMRAvatarCustomizationComponent* C = P->AvatarCustomization;
		UMRAvatarCatalog* Real = C->GetCatalog();
		Check(TEXT("Catalog_Loaded"), Real != nullptr);

		// Synthetic catalog whose entries point at assets that do not exist.
		UMRAvatarCatalog* Cat = DuplicateObject<UMRAvatarCatalog>(Real, this);
		FMRAvatarOption GhostBody = *Cat->FindBody(FName("dev_manny")); GhostBody.Id = FName("dev_ghost_body"); GhostBody.BodyMesh = TSoftObjectPtr<USkeletalMesh>(FSoftObjectPath(TEXT("/Game/DoesNotExist/SKM_Ghost.SKM_Ghost")));
		Cat->Bodies.Add(GhostBody);
		FMRAvatarOption GhostAcc = *Cat->FindAccessory(FName("dev_marker_head_top")); GhostAcc.Id = FName("dev_ghost_accessory"); GhostAcc.AttachmentPointId = FName("MR_Chest");
		GhostAcc.AccessoryMesh = TSoftObjectPtr<UStaticMesh>(FSoftObjectPath(TEXT("/Game/DoesNotExist/SM_Ghost.SM_Ghost")));
		Cat->Accessories.Add(GhostAcc);
		FMRAvatarOption GhostMat = *Cat->FindMaterialVariant(FName("dev_alt")); GhostMat.Id = FName("dev_ghost_material");
		for (FMRMaterialBinding& B : GhostMat.MaterialBindings) B.Material = TSoftObjectPtr<UMaterialInterface>(FSoftObjectPath(TEXT("/Game/DoesNotExist/M_Ghost.M_Ghost")));
		Cat->MaterialVariants.Add(GhostMat);
		C->SetCatalogOverride(Cat);

		FMRAvatarAppearance Good = Cat->MakeDefaultAppearance();
		Good.BodyBaseId = FName("dev_quinn"); Good.AccessoryIds = { FName("dev_marker_head_top") };
		Check(TEXT("GoodAppearanceApplies"), C->PreviewAppearance(Good).bApplied);
		const FMRAvatarAppearance Before = C->GetCurrentAppearance();
		const FString BodyBefore = PawnBodyName(); const int32 AccBefore = AccessoryCount(); const FString MatBefore = PawnMaterialName(0);
		auto Unchanged = [&]() { return C->GetCurrentAppearance() == Before && PawnBodyName() == BodyBefore && AccessoryCount() == AccBefore && PawnMaterialName(0) == MatBefore; };

		FMRAvatarAppearance A = Good; A.BodyBaseId = FName("dev_ghost_body");
		FMRAvatarApplyResult R = C->PreviewAppearance(A);
		Check(TEXT("GhostBodyNotACompatibleBody_Rejected"), !R.bApplied && Unchanged(), R.Message);
		// Now make the missing mesh one of the pawn's registered bodies so the failure happens at asset-load time.
		const int32 GhostIndex = P->DevBodyMeshes.Add(GhostBody.BodyMesh);
		R = C->PreviewAppearance(A);
		Check(TEXT("MissingBodyMeshAssetLoad_RolledBack"), !R.bApplied && Unchanged(), R.Message);
		P->DevBodyMeshes.RemoveAt(GhostIndex);
		A = Good; A.AccessoryIds = { FName("dev_marker_head_top"), FName("dev_ghost_accessory") };
		R = C->PreviewAppearance(A);
		Check(TEXT("MissingAccessoryMesh_RolledBackNoLeftover"), !R.bApplied && Unchanged(), R.Message);
		A = Good; A.MaterialVariantId = FName("dev_ghost_material");
		R = C->PreviewAppearance(A);
		Check(TEXT("MissingMaterial_RolledBack"), !R.bApplied && Unchanged(), R.Message);

		// A save that references the missing body still loads (sanitised or default applied), never crashes.
		UMRAvatarSaveSubsystem* Save = GetGameInstance()->GetSubsystem<UMRAvatarSaveSubsystem>();
		Save->SetCatalogOverride(Cat);
		const FMRAvatarApplyResult L = C->LoadAndApplySaved();
		Check(TEXT("LoadWithBadAssetsDoesNotCrash"), L.bApplied || PawnBodyName() != TEXT("<none>"), L.Message);
		Check(TEXT("PawnAlwaysHasABody"), PawnBodyName() != TEXT("<none>") && Pawn()->GetMesh()->GetAnimInstance() != nullptr, PawnBodyName());
		C->SetCatalogOverride(nullptr); Save->SetCatalogOverride(nullptr);
	}});
	Steps.Add({0.5f, [this]() { Finish(); }});
}

// ---------------------------------------------------------------------------------------------------------------
// Automated MOUSE acceptance test. Pointer events are injected into Slate's real input pipeline (hit-testing,
// button press/release, scroll box wheel handling), so a click only works if the button is actually under the pointer.
// This is NOT a human test.
void AMRAvatarTestDriver::SendPointer(int32 Kind, FVector2D Pos, float WheelDelta)
{
	if (!FSlateApplication::IsInitialized()) return;
	TSharedPtr<FGenericWindow> Native;
	if (GEngine && GEngine->GameViewport && GEngine->GameViewport->GetWindow().IsValid()) Native = GEngine->GameViewport->GetWindow()->GetNativeWindow();
	const FModifierKeysState Mods;
	const uint32 User = FSlateApplicationBase::CursorUserIndex, Ptr = FSlateApplicationBase::CursorPointerIndex;
	const FVector2f P((float)Pos.X, (float)Pos.Y), L((float)LastPointer.X, (float)LastPointer.Y);
	TSet<FKey> Pressed; if (Kind == 1) Pressed.Add(EKeys::LeftMouseButton);
	switch (Kind)
	{
	case 0: FSlateApplication::Get().ProcessMouseMoveEvent(FPointerEvent(User, Ptr, P, L, Pressed, FKey(), 0.f, Mods)); break;
	case 1: FSlateApplication::Get().ProcessMouseButtonDownEvent(Native, FPointerEvent(User, Ptr, P, P, Pressed, EKeys::LeftMouseButton, 0.f, Mods)); break;
	case 2: FSlateApplication::Get().ProcessMouseButtonUpEvent(FPointerEvent(User, Ptr, P, P, Pressed, EKeys::LeftMouseButton, 0.f, Mods)); break;
	case 3: FSlateApplication::Get().ProcessMouseWheelOrGestureEvent(FPointerEvent(User, Ptr, P, P, Pressed, FKey(), WheelDelta, Mods), nullptr); break;
	}
	LastPointer = Pos;
}

void AMRAvatarTestDriver::QueueClick(FName Action, FName Param)
{
	FPendingClick C; C.Action = Action; C.Param = Param;
	Pending = C;
}

void AMRAvatarTestDriver::TickClick()
{
	FPendingClick& C = Pending.GetValue();
	if (C.Wait > 0) { --C.Wait; return; }
	UMRAvatarCreatorWidget* W = Widget();
	if (!W) { Check(FString::Printf(TEXT("MouseClick_%s_%s"), *C.Action.ToString(), *C.Param.ToString()), false, TEXT("no creator widget")); Pending.Reset(); return; }

	switch (C.Phase)
	{
	case 0: // locate the button; scroll the list with the mouse wheel until it is on screen
	{
		FVector2D Center, VMin, VMax;
		if (!W->GetButtonCenter(C.Action, C.Param, Center) || !W->GetScrollViewport(VMin, VMax))
		{
			Check(FString::Printf(TEXT("MouseClick_%s_%s"), *C.Action.ToString(), *C.Param.ToString()), false, TEXT("button not found / not laid out"));
			Pending.Reset(); return;
		}
		if (Center.Y > VMax.Y - 6.0 || Center.Y < VMin.Y + 6.0)
		{
			if (++C.Attempts > 80) { Check(FString::Printf(TEXT("MouseClick_%s_%s"), *C.Action.ToString(), *C.Param.ToString()), false, TEXT("could not scroll button into view")); Pending.Reset(); return; }
			const FVector2D Over((VMin.X + VMax.X) * 0.5, (VMin.Y + VMax.Y) * 0.5);
			SendPointer(0, Over);
			SendPointer(3, Over, Center.Y > VMax.Y ? -1.0f : 1.0f); // negative wheel = scroll down
			++NumWheel;
			C.Wait = 2;
			return;
		}
		C.Pos = Center; C.Phase = 1; return;
	}
	case 1: // move the REAL cursor onto the button (Slate re-derives hover from it every frame), then deliver the move event
		FSlateApplication::Get().SetCursorPos(C.Pos);
		SendPointer(0, C.Pos); C.Phase = 2; C.Wait = 2; return;
	case 2:
		UE_LOG(LogMoonRacer, Display, TEXT("MRAVT|MOUSEDBG|after move   %s %s: %s | slateActive=%d"), *C.Action.ToString(), *C.Param.ToString(), *W->GetButtonDebug(C.Action, C.Param), FSlateApplication::Get().IsActive());
		SendPointer(1, C.Pos); C.Phase = 3; C.Wait = 1; return;
	case 3:
		UE_LOG(LogMoonRacer, Display, TEXT("MRAVT|MOUSEDBG|after down   %s %s: %s"), *C.Action.ToString(), *C.Param.ToString(), *W->GetButtonDebug(C.Action, C.Param));
		SendPointer(2, C.Pos); ++NumClicks; C.Phase = 4; C.Wait = 3; return;
	default:
		UE_LOG(LogMoonRacer, Display, TEXT("MRAVT|MOUSEDBG|after up     %s %s: %s | status='%s'"), *C.Action.ToString(), *C.Param.ToString(), *W->GetButtonDebug(C.Action, C.Param), *W->GetStatus());
		UE_LOG(LogMoonRacer, Display, TEXT("MRAVT|MOUSE|clicked %s %s at (%.0f,%.0f) after %d wheel steps"), *C.Action.ToString(), *C.Param.ToString(), C.Pos.X, C.Pos.Y, C.Attempts);
		Pending.Reset();
		return;
	}
}

void AMRAvatarTestDriver::BuildMouse()
{
	auto Comp = [this]() -> UMRAvatarCustomizationComponent* { return Pawn() ? Pawn()->AvatarCustomization.Get() : nullptr; };
	auto SaveSys = [this]() -> UMRAvatarSaveSubsystem* { return GetGameInstance()->GetSubsystem<UMRAvatarSaveSubsystem>(); };
	auto Click = [this](const TCHAR* A, FName P) { Steps.Add({0.15f, [=, this]() { QueueClick(FName(A), P); }}); };
	auto Then = [this](TFunction<void()> Fn) { Steps.Add({0.15f, MoveTemp(Fn)}); };
	auto Marked = [this](const TCHAR* A, const TCHAR* P) { return Widget() && Widget()->GetButtonLabel(FName(A), FName(P)).StartsWith(TEXT("[x]")); };

	Steps.Add({2.0f, [=, this]()
	{
		UMRAvatarCreatorWidget* W = Widget();
		Check(TEXT("Mouse_CreatorOpen"), W != nullptr && Pawn() != nullptr);
		if (!W || !Comp()) { StepIndex = Steps.Num(); return; }
		Check(TEXT("Mouse_FreshDedicatedSlot"), !SaveSys()->HasSavedAppearance(), UMRAvatarSaveSubsystem::GetSlotName());
		for (const FName& S : MRAvatar::CanonicalSpeciesIds())
			Check(FString::Printf(TEXT("Mouse_SpeciesPendingIndicator_%s"), *S.ToString()), W->GetButtonLabel(TEXT("species"), S).Contains(TEXT("3D model PENDING")), W->GetButtonLabel(TEXT("species"), S));
		Check(TEXT("Mouse_BodiesLabelledDevPlaceholder"), W->GetButtonLabel(TEXT("body"), TEXT("dev_manny")).Contains(TEXT("dev placeholder")) && W->GetButtonLabel(TEXT("body"), TEXT("dev_quinn")).Contains(TEXT("dev placeholder")));
		Shot(TEXT("01_open"));
	}});

	// 1. species + pending indicators (real clicks)
	Click(TEXT("species"), TEXT("alien"));
	Then([=, this]()
	{
		Check(TEXT("Mouse_SpeciesClick_Alien"), Comp()->GetCurrentAppearance().SpeciesId == FName("alien") && Marked(TEXT("species"), TEXT("alien")) && !Marked(TEXT("species"), TEXT("human")), Widget()->GetButtonLabel(TEXT("species"), TEXT("alien")));
		Check(TEXT("Mouse_PreviewNotSavedAfterSpeciesClick"), !SaveSys()->HasSavedAppearance());
	});
	Click(TEXT("species"), TEXT("glitch"));
	Then([=, this]() { Check(TEXT("Mouse_SpeciesClick_Glitch"), Comp()->GetCurrentAppearance().SpeciesId == FName("glitch") && Marked(TEXT("species"), TEXT("glitch"))); });

	// 2. Manny / Quinn switching
	Click(TEXT("body"), TEXT("dev_quinn"));
	Then([=, this]() { Check(TEXT("Mouse_BodyClick_Quinn"), PawnBodyName() == TEXT("SKM_Quinn_Simple") && Marked(TEXT("body"), TEXT("dev_quinn")) && PawnSkeletonName() == TEXT("SK_Mannequin"), PawnBodyName()); Shot(TEXT("02_quinn")); });
	Click(TEXT("body"), TEXT("dev_manny"));
	Then([=, this]() { Check(TEXT("Mouse_BodyClick_Manny"), PawnBodyName() == TEXT("SKM_Manny_Simple") && Marked(TEXT("body"), TEXT("dev_manny")), PawnBodyName()); });
	Click(TEXT("body"), TEXT("dev_quinn"));
	Then([=, this]() { Check(TEXT("Mouse_BodyClick_QuinnAgain"), PawnBodyName() == TEXT("SKM_Quinn_Simple")); });

	// 3. material variants
	Click(TEXT("material"), TEXT("dev_alt"));
	Then([=, this]() { Check(TEXT("Mouse_MaterialClick_Alt"), PawnMaterialName(0) == TEXT("MI_Quinn_02") && Marked(TEXT("material"), TEXT("dev_alt")), PawnMaterialName(0)); Shot(TEXT("03_material_alt")); });
	Click(TEXT("material"), TEXT("dev_default"));
	Then([=, this]() { Check(TEXT("Mouse_MaterialClick_Default"), PawnMaterialName(0) == TEXT("MI_Quinn_01") && Marked(TEXT("material"), TEXT("dev_default")), PawnMaterialName(0)); });
	Click(TEXT("material"), TEXT("dev_alt"));

	// 4. accessories (these sit below the fold, so the wheel must scroll them into view first)
	Click(TEXT("accessory"), TEXT("dev_marker_head_top"));
	Then([=, this]() { Check(TEXT("Mouse_AccessoryClick_HeadTop"), AccessoryCount() == 1 && Marked(TEXT("accessory"), TEXT("dev_marker_head_top")), FString::FromInt(AccessoryCount())); });
	Click(TEXT("accessory"), TEXT("dev_marker_hand_r_grip"));
	Then([=, this]() { Check(TEXT("Mouse_AccessoryClick_RightHand"), AccessoryCount() == 2 && Pawn()->GetAccessory(FName("MR_Hand_R_Grip")) != nullptr); });
	Click(TEXT("accessory"), TEXT("dev_marker_head_top"));
	Then([=, this]() { Check(TEXT("Mouse_AccessoryClick_ToggleOff"), AccessoryCount() == 1 && !Marked(TEXT("accessory"), TEXT("dev_marker_head_top"))); });
	Click(TEXT("accessory"), TEXT("dev_marker_head_top"));
	Then([=, this]() { Check(TEXT("Mouse_AccessoryClick_ToggleOn"), AccessoryCount() == 2); Check(TEXT("Mouse_WheelScrolledListToReachButtons"), NumWheel > 0, FString::Printf(TEXT("wheelSteps=%d"), NumWheel)); Shot(TEXT("04_accessories")); });

	// 5. rotate and zoom (scroll back up with the wheel first by clicking an upper button)
	Then([=, this]() { MouseYawBefore = Pawn()->GetActorRotation().Yaw; MouseArmBefore = Pawn()->GetCameraBoom()->TargetArmLength; });
	Click(TEXT("rotate"), TEXT("right"));
	Then([=, this]() { const float D = FRotator::NormalizeAxis(Pawn()->GetActorRotation().Yaw - MouseYawBefore); Check(TEXT("Mouse_RotateRightClick"), FMath::IsNearlyEqual(D, 25.f, 1.f), FString::Printf(TEXT("delta yaw=%.1f"), D)); });
	Click(TEXT("rotate"), TEXT("left"));
	Click(TEXT("rotate"), TEXT("left"));
	Then([=, this]() { const float D = FRotator::NormalizeAxis(Pawn()->GetActorRotation().Yaw - MouseYawBefore); Check(TEXT("Mouse_RotateLeftClicks"), FMath::IsNearlyEqual(D, -25.f, 1.f), FString::Printf(TEXT("delta yaw=%.1f"), D)); });
	Click(TEXT("zoom"), TEXT("in"));
	Then([=, this]() { const float A = Pawn()->GetCameraBoom()->TargetArmLength; Check(TEXT("Mouse_ZoomInClick"), FMath::IsNearlyEqual(A, MouseArmBefore - 50.f, 1.f), FString::Printf(TEXT("arm %.0f -> %.0f"), MouseArmBefore, A)); Shot(TEXT("05_zoomed_in")); });
	Click(TEXT("zoom"), TEXT("out"));
	Click(TEXT("zoom"), TEXT("out"));
	Then([=, this]() { const float A = Pawn()->GetCameraBoom()->TargetArmLength; Check(TEXT("Mouse_ZoomOutClicks"), FMath::IsNearlyEqual(A, MouseArmBefore + 50.f, 1.f), FString::Printf(TEXT("arm=%.0f"), A)); });

	// 6. Cancel / Reset / Confirm (real clicks)
	Click(TEXT("cancel"), NAME_None);
	Then([=, this]()
	{
		Check(TEXT("Mouse_CancelClick_RevertsToDefault"), PawnBodyName() == TEXT("SKM_Manny_Simple") && Comp()->GetCurrentAppearance().SpeciesId == FName("human") && AccessoryCount() == 0 && PawnMaterialName(0) == TEXT("MI_Manny_01_New"), PawnBodyName());
		Check(TEXT("Mouse_CancelDidNotSave"), !SaveSys()->HasSavedAppearance());
		Check(TEXT("Mouse_UIReflectsCancel"), Marked(TEXT("species"), TEXT("human")) && Marked(TEXT("body"), TEXT("dev_manny")));
		Shot(TEXT("06_after_cancel"));
	});
	Click(TEXT("species"), TEXT("mythraxian"));
	Click(TEXT("body"), TEXT("dev_quinn"));
	Click(TEXT("material"), TEXT("dev_alt"));
	Click(TEXT("accessory"), TEXT("dev_marker_head_top"));
	Click(TEXT("accessory"), TEXT("dev_marker_hand_r_grip"));
	Click(TEXT("confirm"), NAME_None);
	Then([=, this]()
	{
		Check(TEXT("Mouse_ConfirmClick_Saved"), SaveSys()->HasSavedAppearance() && Widget()->GetStatus().Contains(TEXT("saved")), Widget()->GetStatus());
		FMRAvatarLoadReport R; const FMRAvatarAppearance L = SaveSys()->LoadAppearance(R);
		Check(TEXT("Mouse_SavedMatchesUI"), L.SpeciesId == FName("mythraxian") && L.BodyBaseId == FName("dev_quinn") && L.MaterialVariantId == FName("dev_alt") && L.AccessoryIds.Num() == 2, L.ToJsonString());
		Shot(TEXT("07_confirmed"));
	});
	Click(TEXT("reset"), NAME_None);
	Then([=, this]()
	{
		Check(TEXT("Mouse_ResetClick_ShowsDefaults"), PawnBodyName() == TEXT("SKM_Manny_Simple") && Comp()->GetCurrentAppearance().SpeciesId == FName("human") && AccessoryCount() == 0);
		Check(TEXT("Mouse_ResetDidNotOverwriteSave"), Comp()->GetCommittedAppearance().SpeciesId == FName("mythraxian"));
		Shot(TEXT("08_after_reset"));
	});
	Click(TEXT("cancel"), NAME_None);
	Then([=, this]()
	{
		Check(TEXT("Mouse_CancelAfterReset_RestoresSaved"), PawnBodyName() == TEXT("SKM_Quinn_Simple") && Comp()->GetCurrentAppearance().SpeciesId == FName("mythraxian") && AccessoryCount() == 2);
		UE_LOG(LogMoonRacer, Display, TEXT("MRAVT|MOUSE|totals clicks=%d wheelSteps=%d"), NumClicks, NumWheel);
	});
	Steps.Add({0.6f, [this]() { Finish(); }});
}

void AMRAvatarTestDriver::BuildMouseReopen()
{
	Steps.Add({2.0f, [this]()
	{
		UMRAvatarCreatorWidget* W = Widget();
		AMRPlayerCharacter* P = Pawn();
		Check(TEXT("Reopen_CreatorOpens"), W != nullptr && P != nullptr);
		if (!W || !P || !P->AvatarCustomization) { StepIndex = Steps.Num(); return; }
		const FMRAvatarAppearance& A = P->AvatarCustomization->GetCurrentAppearance();
		Check(TEXT("Reopen_RestoredSpeciesAndBody"), A.SpeciesId == FName("mythraxian") && PawnBodyName() == TEXT("SKM_Quinn_Simple"), A.SpeciesId.ToString() + TEXT("/") + PawnBodyName());
		Check(TEXT("Reopen_UIShowsSavedSelections"),
			W->GetButtonLabel(TEXT("species"), TEXT("mythraxian")).StartsWith(TEXT("[x]")) && W->GetButtonLabel(TEXT("body"), TEXT("dev_quinn")).StartsWith(TEXT("[x]")) && W->GetButtonLabel(TEXT("material"), TEXT("dev_alt")).StartsWith(TEXT("[x]"))
			&& W->GetButtonLabel(TEXT("accessory"), TEXT("dev_marker_head_top")).StartsWith(TEXT("[x]")) && W->GetButtonLabel(TEXT("accessory"), TEXT("dev_marker_hand_r_grip")).StartsWith(TEXT("[x]")));
		Check(TEXT("Reopen_PawnMaterialAndAccessories"), PawnMaterialName(0) == TEXT("MI_Quinn_02") && AccessoryCount() == 2);
		Shot(TEXT("01_reopened"));
	}});
	Steps.Add({0.8f, [this]() { Finish(); }});
}
