#include "Dev/MRAvatarV2TestDriver.h"
#include "AvatarV2/MRAvatarV2Camera.h"
#include "AvatarV2/MRAvatarV2Chamber.h"
#include "AvatarV2/MRAvatarV2Controller.h"
#include "AvatarV2/MRAvatarV2Gate.h"
#include "AvatarV2/MRAvatarV2Session.h"
#include "AvatarV2/MRAvatarV2Widget.h"
#include "Avatar/MRAvatarCatalog.h"
#include "Avatar/MRAvatarCustomizationComponent.h"
#include "Avatar/MRAvatarSaveGame.h"
#include "Camera/CameraActor.h"
#include "Components/CapsuleComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Misc/Paths.h"
#include "Engine/GameInstance.h"
#include "Engine/SkeletalMesh.h"
#include "HAL/FileManager.h"
#include "Humanoid/MRPlayerCharacter.h"
#include "Kismet/GameplayStatics.h"
#include "Kismet/KismetSystemLibrary.h"
#include "Materials/MaterialInterface.h"
#include "Misc/CommandLine.h"
#include "Misc/FileHelper.h"
#include "Misc/Parse.h"
#include "UnrealClient.h"
#include "MoonRacer.h"

AMRAvatarV2TestDriver::AMRAvatarV2TestDriver() { PrimaryActorTick.bCanEverTick = true; }
AMRAvatarV2Controller* AMRAvatarV2TestDriver::Ctl() const { return Cast<AMRAvatarV2Controller>(UGameplayStatics::GetPlayerController(this, 0)); }
AMRPlayerCharacter* AMRAvatarV2TestDriver::Pawn() const { return Cast<AMRPlayerCharacter>(UGameplayStatics::GetPlayerPawn(this, 0)); }
FString AMRAvatarV2TestDriver::BodyName() const { const AMRPlayerCharacter* P = Pawn(); return (P && P->GetMesh() && P->GetMesh()->GetSkeletalMeshAsset()) ? P->GetMesh()->GetSkeletalMeshAsset()->GetName() : TEXT("<none>"); }
FString AMRAvatarV2TestDriver::MatName(int32 Slot) const { const AMRPlayerCharacter* P = Pawn(); if (!P || !P->GetMesh() || Slot >= P->GetMesh()->GetNumMaterials()) return TEXT("<none>"); const UMaterialInterface* M = P->GetMesh()->GetMaterial(Slot); return M ? M->GetName() : TEXT("<none>"); }
int32 AMRAvatarV2TestDriver::AccCount() const { const AMRPlayerCharacter* P = Pawn(); return P ? P->GetAccessories().Num() : -1; }

void AMRAvatarV2TestDriver::Check(const FString& Name, bool bPass, const FString& Detail)
{
	(bPass ? NumPass : NumFail)++;
	UE_LOG(LogMoonRacer, Display, TEXT("MRAV2T|CHECK|%s|%s|%s"), bPass ? TEXT("PASS") : TEXT("FAIL"), *Name, *Detail);
}

void AMRAvatarV2TestDriver::Shot(const FString& Name)
{
	if (FParse::Param(FCommandLine::Get(), TEXT("MRNoShots"))) return;
	FScreenshotRequest::RequestScreenshot(FString::Printf(TEXT("MRAV2_%s_%s"), *Mode, *Name), true, true);
	UE_LOG(LogMoonRacer, Display, TEXT("MRAV2T|SHOT|%s"), *Name);
}

void AMRAvatarV2TestDriver::Finish()
{
	UE_LOG(LogMoonRacer, Display, TEXT("MRAV2T|RESULT|%s|%s|pass=%d|fail=%d"), *Mode, NumFail == 0 ? TEXT("PASS") : TEXT("FAIL"), NumPass, NumFail);
	UKismetSystemLibrary::QuitGame(this, UGameplayStatics::GetPlayerController(this, 0), EQuitPreference::Quit, false);
}

void AMRAvatarV2TestDriver::BeginPlay()
{
	Super::BeginPlay();
	Mode = RequestedMode;
	if (Mode.IsEmpty() || !MRAvatarV2Dev::IsFlagPresent() || MRAvatarV2Dev::IsShippingBuild()) { SetActorTickEnabled(false); return; }
	UE_LOG(LogMoonRacer, Display, TEXT("MRAV2T|BEGIN|mode=%s|slot=%s"), *Mode, *UMRAvatarSaveSubsystem::GetSlotName());
}

void AMRAvatarV2TestDriver::Tick(float Dt)
{
	Super::Tick(Dt);
	if (Mode.IsEmpty()) return;
	if (!bStarted)
	{
		WaitForCreator += Dt;
		AMRAvatarV2Controller* C = Ctl();
		const bool bExpectRefusal = Mode == TEXT("refuse");
		if (C && ((C->IsCreatorActive() && Pawn()) || (bExpectRefusal && !C->GetRefusalReason().IsEmpty())))
		{
			bStarted = true;
			if (Mode == TEXT("customize")) BuildCustomize(); else if (Mode == TEXT("restore")) BuildRestore();
			else if (Mode == TEXT("interrupt")) BuildInterrupt(); else if (Mode == TEXT("refuse")) BuildRefuse();
			else { Check(TEXT("known mode"), false, Mode); Finish(); return; }
			bRunning = true;
		}
		else if (WaitForCreator > 25.f) { Check(TEXT("creator started"), false, TEXT("timeout")); Finish(); }
		return;
	}
	if (!bRunning) return;
	StepTimer += Dt;
	while (StepIndex < Steps.Num() && StepTimer >= Steps[StepIndex].Delay)
	{
		StepTimer = 0.f;
		TFunction<void()> F = Steps[StepIndex].Fn; ++StepIndex;
		F();
		if (!bRunning) return;
	}
	if (StepIndex >= Steps.Num()) { bRunning = false; Finish(); }
}

void AMRAvatarV2TestDriver::BuildCustomize()
{
	auto S = [this](float D, TFunction<void()> F) { Steps.Add({ D, MoveTemp(F) }); };
	S(1.0f, [this]() {
		AMRAvatarV2Controller* C = Ctl(); AMRAvatarV2Chamber* Ch = C->GetChamber(); UMRAvatarV2Widget* W = C->GetWidget(); UMRAvatarV2Session* Se = C->GetSession();
		Check(TEXT("dev slot in use, not the default"), UMRAvatarSaveSubsystem::GetSlotName() != MRAvatarV2Dev::ProtectedDefaultSlot, UMRAvatarSaveSubsystem::GetSlotName());
		Check(TEXT("chamber built"), Ch && Ch->IsBuilt() && Ch->GetStats().NumMeshes > 100, Ch ? FString::Printf(TEXT("meshes=%d lights=%d devMaterials=%d"), Ch->GetStats().NumMeshes, Ch->GetStats().NumLights, Ch->GetStats().bUsingDevMaterials) : FString());
		Check(TEXT("chamber has pod/lights/vapor"), Ch && Ch->GetStats().NumLights >= 6 && Ch->GetStats().NumAnimated > 0 && Ch->GetStats().NumShadowCastingLights <= 2);
		const FString Sign = Ch ? Ch->AllSignageText() : FString();
		Check(TEXT("signage never names The Core"), !Sign.Contains(TEXT("core"), ESearchCase::IgnoreCase) && Sign.Contains(TEXT("NAME PENDING CANON")) && Sign.Contains(TEXT("NONCANON")), Sign.Replace(TEXT("\n"), TEXT(" / ")));
		Check(TEXT("widget + session + 6 stages + 14 categories"), W && Se && UMRAvatarV2Session::Stages().Num() == 6 && UMRAvatarV2Session::Categories().Num() == 14);
		int32 Cat = 0; for (const FMRV2Category& K : UMRAvatarV2Session::Categories()) Cat += W->HasButton(FName("category"), FName(*FString::FromInt(K.Number))) ? 1 : 0;
		int32 Stg = 0; for (const FMRV2Stage& K : UMRAvatarV2Session::Stages()) Stg += W->HasButton(FName("stage"), FName(*FString::FromInt(K.Number))) ? 1 : 0;
		Check(TEXT("UI shows all 14 category buttons and 6 stage buttons"), Cat == 14 && Stg == 6, FString::Printf(TEXT("cat=%d stg=%d"), Cat, Stg));
		const FVector Feet = Ch->GetCharacterFeet(); const FVector Loc = Pawn()->GetActorLocation();
		Check(TEXT("character stands on platform centre"), FVector::Dist2D(Loc, Feet) < 2.f && FMath::Abs((Loc.Z - Feet.Z) - Pawn()->GetCapsuleComponent()->GetScaledCapsuleHalfHeight()) < 3.f, Loc.ToString());
		Check(TEXT("full-body framing keeps the character prominent"), C->CameraModel().ApproxCharacterScreenFraction(180.f) > 0.55f, FString::Printf(TEXT("%.2f"), C->CameraModel().ApproxCharacterScreenFraction(180.f)));
		Shot(TEXT("01_full_body"));
	});
	S(1.2f, [this]() {   // camera views, orbit, zoom; the appearance and character position must not change
		AMRAvatarV2Controller* C = Ctl(); const FMRAvatarAppearance Before = C->GetSession()->Working(); const FVector Pos = Pawn()->GetActorLocation();
		auto Run = [&](EMRV2View V) { C->CameraCommand(FName("view"), FName(FMRAvatarV2CameraModel::Preset(V).Name)); C->CameraModel().Tick(5.f); C->ApplyCamera(); };
		Run(EMRV2View::Face);  Check(TEXT("face view close"), C->CameraModel().GetDistance() < 100.f && C->GetCameraActor()->GetActorLocation().Z > 150.f);
		Run(EMRV2View::Side);  Check(TEXT("side view yaw 90"), FMath::IsNearlyEqual(C->CameraModel().GetYaw(), 90.f, 1.f));
		Run(EMRV2View::Rear);  Check(TEXT("rear view yaw 180"), FMath::Abs(C->CameraModel().GetYaw()) > 179.f);
		Run(EMRV2View::Front); Check(TEXT("front view yaw 0"), FMath::Abs(C->CameraModel().GetYaw()) < 1.f);
		Run(EMRV2View::FullBody);
		C->Orbit(500.f, 500.f); C->CameraModel().Tick(5.f);
		Check(TEXT("orbit pitch clamped"), C->CameraModel().GetPitch() <= FMRAvatarV2CameraModel::Preset(EMRV2View::FullBody).MaxPitch + 0.01f);
		C->WheelZoom(-50.f); C->CameraModel().Tick(5.f);
		Check(TEXT("zoom clamped to limits"), C->CameraModel().GetDistance() >= 320.f && C->CameraModel().GetDistance() <= 520.f, FString::Printf(TEXT("%.0f"), C->CameraModel().GetDistance()));
		C->CameraCommand(FName("reset_camera"), NAME_None); C->CameraModel().Tick(5.f);
		Check(TEXT("reset camera restores framing"), FMath::IsNearlyEqual(C->CameraModel().GetDistance(), 400.f, 1.f) && FMath::IsNearlyEqual(C->CameraModel().GetPitch(), 4.f, 0.5f));
		Check(TEXT("camera interaction left appearance untouched"), C->GetSession()->Working() == Before);
		Check(TEXT("camera interaction left the character in place"), FVector::Dist(Pawn()->GetActorLocation(), Pos) < 1.f);
	});
	S(0.8f, [this]() {
		AMRAvatarV2Controller* C = Ctl(); C->CameraCommand(FName("view"), FName("Face")); C->CameraModel().Tick(5.f); C->ApplyCamera(); Shot(TEXT("02_face"));
	});
	S(1.2f, [this]() { AMRAvatarV2Controller* C = Ctl(); C->CameraCommand(FName("view"), FName("Side")); C->CameraModel().Tick(5.f); C->ApplyCamera(); Shot(TEXT("03_side")); });
	S(1.2f, [this]() { AMRAvatarV2Controller* C = Ctl(); C->CameraCommand(FName("view"), FName("Rear")); C->CameraModel().Tick(5.f); C->ApplyCamera(); Shot(TEXT("04_rear")); });
	S(1.2f, [this]() {   // functional edits through the real UI actions
		AMRAvatarV2Controller* C = Ctl(); UMRAvatarV2Widget* W = C->GetWidget(); UMRAvatarV2Session* Se = C->GetSession();
		C->CameraCommand(FName("view"), FName("Full body")); C->CameraModel().Tick(5.f); C->ApplyCamera();
		const FString Body0 = BodyName();
		W->HandleAction(FName("category"), FName("1"));
		Check(TEXT("species panel lists six canonical ids"), W->HasButton(FName("species"), FName("human")) && W->HasButton(FName("species"), FName("mythraxian")) && W->HasButton(FName("species"), FName("glitch")) && W->HasButton(FName("species"), FName("hybrid")) && W->HasButton(FName("species"), FName("ai")) && W->HasButton(FName("species"), FName("alien")));
		int32 Changed = 0;
		for (const TCHAR* Sp : { TEXT("hybrid"), TEXT("ai"), TEXT("alien"), TEXT("mythraxian"), TEXT("glitch"), TEXT("human") })
		{
			W->HandleAction(FName("species"), FName(Sp));
			if (Se->Working().SpeciesId == FName(Sp)) ++Changed;
		}
		Check(TEXT("species id changes for all six ids"), Changed == 6);
		Check(TEXT("species switch does not claim a unique model (body unchanged)"), BodyName() == Body0 && W->GetPanelText().Contains(TEXT("no species")));
		W->HandleAction(FName("category"), FName("2"));
		Check(TEXT("body panel offers dev bodies only"), W->HasButton(FName("body"), FName("dev_manny")) && W->HasButton(FName("body"), FName("dev_quinn")) && W->GetPanelText().Contains(TEXT("development placeholder")));
		W->HandleAction(FName("body"), FName("dev_quinn"));
		Check(TEXT("body switch changes the actual mesh"), BodyName() != Body0 && Se->Working().BodyBaseId == FName("dev_quinn"), Body0 + TEXT(" -> ") + BodyName());
		Shot(TEXT("05_body_quinn"));
		W->HandleAction(FName("category"), FName("11"));
		const int32 Acc0 = AccCount();
		W->HandleAction(FName("accessory"), FName("dev_marker_head_top"));
		Check(TEXT("accessory attaches a real component"), AccCount() == Acc0 + 1 && Se->Working().AccessoryIds.Contains(FName("dev_marker_head_top")), FString::Printf(TEXT("%d -> %d"), Acc0, AccCount()));
		W->HandleAction(FName("accessory"), FName("dev_marker_hand_r_grip"));
		Check(TEXT("second accessory on another point"), AccCount() == Acc0 + 2);
		W->HandleAction(FName("accessory"), FName("dev_marker_head_top"));
		Check(TEXT("toggling removes it"), AccCount() == Acc0 + 1 && !Se->Working().AccessoryIds.Contains(FName("dev_marker_head_top")));
		W->HandleAction(FName("accessory"), FName("dev_marker_head_top"));   // leave two attached for the screenshot and the saved state
		W->HandleAction(FName("category"), FName("12"));
		const FString MatBefore = MatName();
		W->HandleAction(FName("material"), FName("dev_alt"));
		Check(TEXT("material variant changes the real material"), MatName() != MatBefore && Se->Working().MaterialVariantId == FName("dev_alt"), MatBefore + TEXT(" -> ") + MatName());
		Check(TEXT("Pending signal-accent ids are explained, not offered as controls"), W->GetPanelText().Contains(TEXT("all are Pending")));
	});
	S(1.0f, [this]() {
		AMRAvatarV2Controller* C = Ctl(); UMRAvatarV2Widget* W = C->GetWidget(); UMRAvatarV2Session* Se = C->GetSession();
		Shot(TEXT("06_style_gear"));
	});
	S(0.6f, [this]() {
		AMRAvatarV2Controller* C = Ctl(); UMRAvatarV2Widget* W = C->GetWidget(); UMRAvatarV2Session* Se = C->GetSession();
		// Unsupported categories explain themselves and expose no working control.
		for (int32 N : { 3, 4, 5, 6, 7, 8, 9, 10, 14 })
		{
			W->HandleAction(FName("category"), FName(*FString::FromInt(N)));
			const FMRV2Capability Cap = Se->Capability(N);
			const bool bNoControl = !W->HasButton(FName("species"), FName("human")) && !W->HasButton(FName("body"), FName("dev_manny")) && !W->HasButton(FName("accessory"), FName("dev_marker_head_top"));
			Check(FString::Printf(TEXT("category %02d unavailable + explained, no fake control"), N), Cap.Support == EMRV2Support::Unavailable && Cap.Unavailable.Num() > 0 && bNoControl && W->GetPanelText().Contains(TEXT("NOT AVAILABLE")));
		}
		W->HandleAction(FName("category"), FName("6"));
	});
	S(0.6f, [this]() {
		Shot(TEXT("07_hair_unavailable"));
		AMRAvatarV2Controller* C = Ctl(); UMRAvatarV2Widget* W = C->GetWidget(); UMRAvatarV2Session* Se = C->GetSession();
		// House Crest: placeholders only, original vs active, no future-change path.
		W->HandleAction(FName("stage"), FName("4"));
		Check(TEXT("stage 4 selects category 13"), W->GetCategory() == 13 && W->GetStage() == 4);
		Check(TEXT("crest panel is labelled noncanon and has no change path"), W->GetPanelText().Contains(TEXT("NONCANON")) && W->GetPanelText().Contains(TEXT("unavailable")) && !UMRAvatarV2Session::AreCrestChangesAvailable());
		W->HandleAction(FName("crest"), FName("TEST_FIXTURE_NONCANON_CREST_B"));
		Check(TEXT("placeholder crest chosen: original == active"), Se->OriginalCrestId() == FName("TEST_FIXTURE_NONCANON_CREST_B") && Se->ActiveCrestId() == Se->OriginalCrestId() && !Se->IsCrestLocked());
	});
	S(0.6f, [this]() {
		Shot(TEXT("08_house_crest"));
	});
	S(0.6f, [this]() {
		AMRAvatarV2Controller* C = Ctl(); UMRAvatarV2Widget* W = C->GetWidget();
		// Six-stage navigation.
		for (int32 N = 1; N <= 6; ++N) { W->HandleAction(FName("stage"), FName(*FString::FromInt(N))); }
		Check(TEXT("stage 6 is Final Review"), W->GetStage() == 6 && W->GetCategory() == 0 && W->HasButton(FName("save"), NAME_None));
		W->HandleAction(FName("next"), NAME_None); Check(TEXT("next clamps at the last stage"), W->GetStage() == 6);
		W->HandleAction(FName("back"), NAME_None); Check(TEXT("back goes to Identity"), W->GetStage() == 5 && W->GetCategory() == 14);
	});
	S(0.6f, [this]() {
		Ctl()->GetWidget()->HandleAction(FName("stage"), FName("6"));
	});
	S(0.6f, [this]() {
		Shot(TEXT("09_final_review"));
	});
	S(0.8f, [this]() {   // save to the dev slot; crest locks (session only)
		AMRAvatarV2Controller* C = Ctl(); UMRAvatarV2Widget* W = C->GetWidget(); UMRAvatarV2Session* Se = C->GetSession();
		const FString Slot = UMRAvatarSaveSubsystem::SlotFilePath();
		W->HandleAction(FName("save"), NAME_None);
		Check(TEXT("saved to the dev slot file"), IFileManager::Get().FileExists(*Slot) && Slot.Contains(MRAvatarV2Dev::DefaultDevSlot), Slot);
		Check(TEXT("original crest locks after save"), Se->IsCrestLocked());
		const FMRV2Result R = Se->SelectCrest(FName("TEST_FIXTURE_NONCANON_CREST_A"));
		Check(TEXT("locked original crest cannot be changed"), !R.bOk && Se->OriginalCrestId() == FName("TEST_FIXTURE_NONCANON_CREST_B"), R.Message);
		const FMRV2Result Bad = Se->SelectCrest(FName("House_Obsidian"));
		Check(TEXT("non-placeholder crest ids are rejected"), !Bad.bOk);
		TArray<FString> Files; IFileManager::Get().FindFiles(Files, *(FPaths::ProjectSavedDir() / TEXT("SaveGames") / TEXT("*Crest*")), true, false);
		Check(TEXT("no crest save record exists (crest is session-only)"), Files.Num() == 0, FString::FromInt(Files.Num()));
		Shot(TEXT("10_after_save"));
	});
}

void AMRAvatarV2TestDriver::BuildRestore()
{
	auto S = [this](float D, TFunction<void()> F) { Steps.Add({ D, MoveTemp(F) }); };
	S(1.0f, [this]() {
		AMRAvatarV2Controller* C = Ctl(); UMRAvatarV2Session* Se = C->GetSession(); UMRAvatarV2Widget* W = C->GetWidget();
		const FMRAvatarAppearance& A = Se->Working();
		Check(TEXT("relaunch restores the saved avatar: species"), A.SpeciesId == FName("human"), A.SpeciesId.ToString());
		Check(TEXT("relaunch restores body"), A.BodyBaseId == FName("dev_quinn") && BodyName().Contains(TEXT("Quinn")), BodyName());
		Check(TEXT("relaunch restores accessories on the real pawn"), A.AccessoryIds.Num() == 2 && AccCount() == 2, FString::Printf(TEXT("ids=%d components=%d"), A.AccessoryIds.Num(), AccCount()));
		Check(TEXT("relaunch restores material variant"), A.MaterialVariantId == FName("dev_alt"));
		Check(TEXT("House Crest is session-only: not restored"), Se->OriginalCrestId().IsNone() && !Se->IsCrestLocked());
		Check(TEXT("status says restored"), Se->LastStatus().Contains(TEXT("Restored")), Se->LastStatus());
		Shot(TEXT("01_restored"));
		// Invalid ids: rejected, nothing changes.
		const FMRAvatarAppearance Before = Se->Working(); const FString Body0 = BodyName(); const int32 Acc0 = AccCount();
		Check(TEXT("invalid species id rejected"), !Se->SetSpecies(FName("elf")).bOk && Se->Working() == Before);
		Check(TEXT("invalid body id rejected"), !Se->SetBody(FName("no_such_body")).bOk && Se->Working() == Before && BodyName() == Body0);
		Check(TEXT("invalid accessory id rejected"), !Se->ToggleAccessory(FName("no_such_acc")).bOk && Se->Working() == Before && AccCount() == Acc0);
		Check(TEXT("invalid material id rejected"), !Se->SetMaterialVariant(FName("no_such_mat")).bOk && Se->Working() == Before);
		// Missing asset: a body option whose mesh does not exist must fail without changing the character.
		UMRAvatarCatalog* Orig = Se->Catalog(); TArray<uint8> Bytes0; FFileHelper::LoadFileToArray(Bytes0, *UMRAvatarSaveSubsystem::SlotFilePath());
		UMRAvatarCatalog* Dup = DuplicateObject<UMRAvatarCatalog>(Se->Catalog(), GetTransientPackage());
		FMRAvatarOption Ghost; Ghost.Id = FName("dev_missing_body"); Ghost.DisplayName = FText::FromString(TEXT("missing")); Ghost.Status = EMRAvatarAssetStatus::DevPlaceholder;
		Ghost.BodyMesh = TSoftObjectPtr<USkeletalMesh>(FSoftObjectPath(TEXT("/Game/MoonRacer/DoesNotExist/SKM_Missing.SKM_Missing")));
		Dup->Bodies.Add(Ghost);
		Pawn()->AvatarCustomization->SetCatalogOverride(Dup); Se->SetCatalogForTest(Dup);
		const FMRV2Result M = Se->SetBody(FName("dev_missing_body"));
		Check(TEXT("missing body asset: not applied, character unchanged"), !M.bOk && Se->Working() == Before && BodyName() == Body0, M.Message);
		Pawn()->AvatarCustomization->SetCatalogOverride(nullptr); Se->SetCatalogForTest(Orig);
		// Repeated customisation: many rapid edits stay consistent and leak no components.
		for (int32 i = 0; i < 30; ++i) { Se->ToggleAccessory(FName("dev_marker_head_top")); Se->SetBody(i % 2 ? FName("dev_manny") : FName("dev_quinn")); Se->SetMaterialVariant(i % 2 ? FName("dev_default") : FName("dev_alt")); }
		Se->SetBody(FName("dev_quinn")); Se->SetMaterialVariant(FName("dev_alt"));
		Check(TEXT("repeated customisation stays consistent"), AccCount() == Se->Working().AccessoryIds.Num() && BodyName().Contains(TEXT("Quinn")), FString::Printf(TEXT("ids=%d components=%d"), Se->Working().AccessoryIds.Num(), AccCount()));
		const FMRV2Result Rv = Se->RevertToCommitted();
		Check(TEXT("revert restores the saved state"), Rv.bOk && Se->Working() == Before && AccCount() == 2, Rv.Message);
		TArray<uint8> Bytes1; FFileHelper::LoadFileToArray(Bytes1, *UMRAvatarSaveSubsystem::SlotFilePath());
		Check(TEXT("the dev slot file is byte-identical after unsaved edits"), Bytes0.Num() > 0 && Bytes0 == Bytes1);
	});
}

void AMRAvatarV2TestDriver::BuildInterrupt()
{
	auto S = [this](float D, TFunction<void()> F) { Steps.Add({ D, MoveTemp(F) }); };
	S(0.8f, [this]() {
		AMRAvatarV2Controller* C = Ctl(); UMRAvatarV2Session* Se = C->GetSession();
		const FString Slot = UMRAvatarSaveSubsystem::SlotFilePath(); const FString Tmp = Slot + TEXT(".tmp");
		Check(TEXT("interrupt run uses a dev slot"), !MRAvatarV2Dev::IsProtectedSlot(UMRAvatarSaveSubsystem::GetSlotName()) && Slot.Contains(TEXT("MRAvatarV2")), Slot);
		Se->SetSpecies(FName("alien"));
		// 1) A half-written temp file from an interrupted save must not block or corrupt the next save.
		FFileHelper::SaveStringToFile(TEXT("HALF-WRITTEN"), *Tmp);
		const FMRV2Result R1 = Se->SaveToDevSlot();
		Check(TEXT("save succeeds despite a stale temp file"), R1.bOk, R1.Message);
		TArray<uint8> Good; FFileHelper::LoadFileToArray(Good, *Slot);
		Check(TEXT("saved file is non-trivial and the temp is gone"), Good.Num() > 64 && !IFileManager::Get().FileExists(*Tmp), FString::FromInt(Good.Num()));
		// 2) Truncated slot (power loss mid-write of the final file): load must fall back safely and preserve the file.
		TArray<uint8> Cut(Good.GetData(), Good.Num() / 2);
		FFileHelper::SaveArrayToFile(Cut, *Slot);
		Se->SetSpecies(FName("glitch"));
		const FMRV2Result L = Se->LoadFromDevSlot();
		Check(TEXT("truncated slot: load falls back to a usable avatar"), L.bOk && Pawn()->AvatarCustomization->HasApplied(), L.Message);
		TArray<uint8> After; FFileHelper::LoadFileToArray(After, *Slot);
		Check(TEXT("truncated file is preserved, not overwritten by load"), After == Cut);
		// 3) A fresh save over the damaged slot succeeds and yields a valid file again.
		const FMRV2Result R2 = Se->SaveToDevSlot();
		TArray<uint8> Fixed; FFileHelper::LoadFileToArray(Fixed, *Slot);
		Check(TEXT("save over a damaged slot succeeds"), R2.bOk && Fixed.Num() > Cut.Num(), R2.Message);
		const FMRV2Result L2 = Se->LoadFromDevSlot();
		Check(TEXT("and it loads back"), L2.bOk && Se->Working().SpeciesId == Se->Catalog()->DefaultSpeciesId, Se->Working().SpeciesId.ToString());
	});
}

void AMRAvatarV2TestDriver::BuildRefuse()
{
	auto S = [this](float D, TFunction<void()> F) { Steps.Add({ D, MoveTemp(F) }); };
	S(0.5f, [this]() {
		AMRAvatarV2Controller* C = Ctl();
		Check(TEXT("creator refused on the protected default slot"), !C->IsCreatorActive() && C->GetRefusalReason().Contains(TEXT("default player avatar slot")), C->GetRefusalReason());
		Check(TEXT("no widget, no session, no write"), !C->GetWidget() && !C->GetSession());
	});
}
