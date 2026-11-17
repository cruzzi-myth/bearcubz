#include "Avatar/MRAvatarCustomizationComponent.h"
#include "Avatar/MRAvatarCatalog.h"
#include "Avatar/MRAvatarSaveGame.h"
#include "Humanoid/MRPlayerCharacter.h"
#include "Components/SkeletalMeshComponent.h"
#include "Engine/GameInstance.h"
#include "Engine/SkeletalMesh.h"
#include "Engine/StaticMesh.h"
#include "Components/StaticMeshComponent.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Materials/MaterialInterface.h"
#include "MoonRacer.h"

UMRAvatarCustomizationComponent::UMRAvatarCustomizationComponent()
{
	PrimaryComponentTick.bCanEverTick = false;
}

AMRPlayerCharacter* UMRAvatarCustomizationComponent::GetPlayerCharacter() const
{
	return Cast<AMRPlayerCharacter>(GetOwner());
}

UMRAvatarCatalog* UMRAvatarCustomizationComponent::GetCatalog()
{
	if (CatalogOverride) return CatalogOverride;
	if (!CachedCatalog) CachedCatalog = UMRAvatarCatalog::LoadDefault();
	return CachedCatalog;
}

void UMRAvatarCustomizationComponent::BeginPlay()
{
	Super::BeginPlay();
}

FString UMRAvatarCustomizationComponent::ApplyUnchecked(const FMRAvatarAppearance& A, UMRAvatarCatalog* Catalog)
{
	AMRPlayerCharacter* P = GetPlayerCharacter();
	if (!P || !P->GetMesh()) return TEXT("owner is not an AMRPlayerCharacter with a mesh");

	// --- body: find the matching entry in the pawn's DevBodyMeshes (same humanoid skeleton) ---
	const FMRAvatarOption* Body = Catalog->FindBody(A.BodyBaseId);
	if (!Body || !Body->IsAvailable()) return TEXT("body has no usable 3D asset");
	int32 BodyIndex = INDEX_NONE;
	for (int32 i = 0; i < P->DevBodyMeshes.Num(); ++i)
	{
		if (P->DevBodyMeshes[i].ToSoftObjectPath() == Body->BodyMesh.ToSoftObjectPath()) { BodyIndex = i; break; }
	}
	if (BodyIndex == INDEX_NONE) return TEXT("body mesh is not one of this character's compatible humanoid bodies");
	if (!P->SetDevBodyMesh(BodyIndex)) return TEXT("body switch failed (missing asset or skeleton mismatch)");

	// --- accessories on the existing rigid attachment points ---
	P->ClearAllAccessories();
	for (const FName& Id : A.AccessoryIds)
	{
		const FMRAvatarOption* O = Catalog->FindAccessory(Id);
		if (!O || !O->IsAvailable()) continue; // pending: stored, not applied
		UStaticMesh* Mesh = O->AccessoryMesh.LoadSynchronous();
		if (!Mesh) return FString::Printf(TEXT("accessory '%s' mesh failed to load"), *Id.ToString());
		UStaticMeshComponent* Comp = P->AttachRigidAccessory(O->AttachmentPointId, Mesh, O->AccessoryScale);
		if (!Comp) return FString::Printf(TEXT("accessory '%s' could not attach at %s"), *Id.ToString(), *O->AttachmentPointId.ToString());
		if (!O->DevTint.Equals(FLinearColor::White)) // dev marker tint (engine BasicShapeMaterial "Color")
		{
			if (UMaterialInterface* Base = LoadObject<UMaterialInterface>(nullptr, TEXT("/Engine/BasicShapes/BasicShapeMaterial.BasicShapeMaterial")))
			{
				UMaterialInstanceDynamic* MID = UMaterialInstanceDynamic::Create(Base, Comp);
				MID->SetVectorParameterValue(TEXT("Color"), O->DevTint);
				Comp->SetMaterial(0, MID);
			}
		}
	}

	// --- material variant (SetDevBodyMesh already reset overrides, so default = no override) ---
	if (const FMRAvatarOption* V = Catalog->FindMaterialVariant(A.MaterialVariantId))
	{
		if (V->IsAvailable())
		{
			for (const FMRMaterialBinding& B : V->MaterialBindings)
			{
				if (B.BodyId != A.BodyBaseId) continue;
				UMaterialInterface* M = B.Material.LoadSynchronous();
				if (!M) return TEXT("material variant asset failed to load");
				if (!P->SetBodyMaterial(B.SlotIndex, M)) return TEXT("material slot rejected");
			}
		}
	}
	return FString();
}

FMRAvatarApplyResult UMRAvatarCustomizationComponent::PreviewAppearance(const FMRAvatarAppearance& A)
{
	FMRAvatarApplyResult R;
	UMRAvatarCatalog* Catalog = GetCatalog();
	if (!Catalog) { R.Message = TEXT("avatar catalog is not available"); return R; }

	R.Validation = Catalog->Validate(A);
	if (!R.Validation.IsValid()) { R.Message = TEXT("rejected: ") + R.Validation.ToString(); return R; } // nothing touched
	if (R.Validation.CountSeverity(EMRAvatarIssueSeverity::Pending) > 0)
	{
		for (const FMRAvatarIssue& I : R.Validation.Issues) { if (I.Severity == EMRAvatarIssueSeverity::Pending) R.SkippedPending.Add(I.Id); }
	}
	const FMRAvatarOption* Body = Catalog->FindBody(A.BodyBaseId);
	if (!Body || !Body->IsAvailable()) { R.Message = TEXT("rejected: body has no 3D asset (pending)"); return R; }

	const FString Failure = ApplyUnchecked(A, Catalog);
	if (!Failure.IsEmpty())
	{
		// Roll back to the last good state so the character is never left half-applied.
		if (bHasApplied)
		{
			const FString RollbackFailure = ApplyUnchecked(Current, Catalog);
			if (!RollbackFailure.IsEmpty()) UE_LOG(LogMoonRacer, Error, TEXT("Avatar rollback failed: %s"), *RollbackFailure);
		}
		R.Message = TEXT("failed (rolled back): ") + Failure;
		return R;
	}
	Current = A;
	bHasApplied = true;
	R.bApplied = true;
	R.Message = R.SkippedPending.Num() > 0 ? TEXT("applied; pending slots stored but not shown") : TEXT("applied");
	return R;
}

void UMRAvatarCustomizationComponent::CommitCurrent()
{
	if (!bHasApplied) return;
	Committed = Current;
}

FMRAvatarApplyResult UMRAvatarCustomizationComponent::RevertToCommitted()
{
	if (Committed.BodyBaseId.IsNone())
	{
		return ResetToDefault();
	}
	return PreviewAppearance(Committed);
}

FMRAvatarApplyResult UMRAvatarCustomizationComponent::ResetToDefault()
{
	UMRAvatarCatalog* Catalog = GetCatalog();
	if (!Catalog) { FMRAvatarApplyResult R; R.Message = TEXT("avatar catalog is not available"); return R; }
	FMRAvatarAppearance D = Catalog->MakeDefaultAppearance();
	D.AvatarId = Current.AvatarId.IsValid() ? Current.AvatarId : D.AvatarId;
	return PreviewAppearance(D);
}

FMRAvatarApplyResult UMRAvatarCustomizationComponent::LoadAndApplySaved()
{
	UGameInstance* GI = GetWorld() ? GetWorld()->GetGameInstance() : nullptr;
	UMRAvatarSaveSubsystem* Save = GI ? GI->GetSubsystem<UMRAvatarSaveSubsystem>() : nullptr;
	UMRAvatarCatalog* Catalog = GetCatalog();
	FMRAvatarApplyResult R;
	if (!Save || !Catalog) { R.Message = TEXT("save subsystem or catalog unavailable"); return R; }
	if (CatalogOverride) Save->SetCatalogOverride(CatalogOverride);

	FMRAvatarLoadReport Report;
	FMRAvatarAppearance A = Save->LoadAppearance(Report);
	for (const FString& N : Report.Notes) UE_LOG(LogMoonRacer, Display, TEXT("MRAVATAR|LOAD|note|%s"), *N);
	R = PreviewAppearance(A);
	if (!R.bApplied)
	{
		// Last resort: the catalog default, so a bad/missing asset can never leave the pawn without an avatar.
		R = PreviewAppearance(Catalog->MakeDefaultAppearance());
		R.Message = TEXT("saved appearance could not be applied; default used. ") + R.Message;
	}
	if (R.bApplied) CommitCurrent();
	UE_LOG(LogMoonRacer, Display, TEXT("MRAVATAR|LOAD|found=%d|migrated=%d|sanitized=%d|applied=%d|body=%s|species=%s"), Report.bFoundSave, Report.bMigrated, Report.bSanitized, R.bApplied, *Current.BodyBaseId.ToString(), *Current.SpeciesId.ToString());
	return R;
}
