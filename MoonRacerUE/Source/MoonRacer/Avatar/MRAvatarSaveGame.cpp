#include "Avatar/MRAvatarSaveGame.h"
#include "Avatar/MRAvatarCatalog.h"
#include "Avatar/MRSaveIntegrity.h"
#include "HAL/FileManager.h"
#include "Kismet/GameplayStatics.h"
#include "Misc/Paths.h"
#include "Misc/CommandLine.h"
#include "Misc/Parse.h"
#include "MoonRacer.h"

namespace
{
	FString GSlotOverride;
	constexpr int32 AvatarSaveUserIndex = 0;
}

FString UMRAvatarSaveSubsystem::GetSlotName()
{
	if (!GSlotOverride.IsEmpty()) return GSlotOverride;
	FString FromCmd;
	if (FParse::Value(FCommandLine::Get(), TEXT("MRAvatarSlot="), FromCmd) && !FromCmd.IsEmpty()) return FromCmd;
	return TEXT("MRAvatar_Local");
}

void UMRAvatarSaveSubsystem::SetSlotNameOverride(const FString& Name) { GSlotOverride = Name; }

FString UMRAvatarSaveSubsystem::SlotFilePath() { return FPaths::ProjectSavedDir() / TEXT("SaveGames") / (GetSlotName() + TEXT(".sav")); }

void UMRAvatarSaveSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);
	// Test hook: start from a clean slate.
	if (FParse::Param(FCommandLine::Get(), TEXT("MRAvatarFresh")))
	{
		DeleteSavedAppearance();
	}
}

UMRAvatarCatalog* UMRAvatarSaveSubsystem::GetCatalog()
{
	if (CatalogOverride) return CatalogOverride;
	if (!CachedCatalog) CachedCatalog = UMRAvatarCatalog::LoadDefault();
	return CachedCatalog;
}

bool UMRAvatarSaveSubsystem::HasSavedAppearance() const
{
	return IFileManager::Get().FileExists(*SlotFilePath());
}

bool UMRAvatarSaveSubsystem::DeleteSavedAppearance()
{
	const FString Path = SlotFilePath();
	if (!IFileManager::Get().FileExists(*Path)) return false;
	// A valid current-format save is simply removed. Anything else (legacy / unrecognised / corrupt) is moved aside, never destroyed.
	FString Err;
	if (!MRSaveIntegrity::PreserveUnrecognized(Path, Err)) return false;
	IFileManager::Get().Delete(*(Path + TEXT(".tmp")), false, true, true);
	return IFileManager::Get().Delete(*Path, false, true, true);
}

bool UMRAvatarSaveSubsystem::SaveAppearance(const FMRAvatarAppearance& Appearance, FString& OutError)
{
	UMRAvatarCatalog* Catalog = GetCatalog();
	if (!Catalog) { OutError = TEXT("avatar catalog is not available"); return false; }
	const FMRAvatarValidationResult V = Catalog->Validate(Appearance);
	if (!V.IsValid()) { OutError = V.ToString(); return false; }

	UMRAvatarSaveGame* Save = NewObject<UMRAvatarSaveGame>(GetTransientPackage());
	Save->SaveVersion = MRAvatarSave::CurrentSaveVersion;
	Save->Appearance = Appearance;
	Save->Appearance.SchemaVersion = MRAvatar::CurrentSchemaVersion;
	TArray<uint8> Payload;
	if (!UGameplayStatics::SaveGameToMemory(Save, Payload) || Payload.Num() == 0) { OutError = TEXT("could not serialise the avatar save"); return false; }

	// Never destroy a valid save written by a NEWER build.
	{
		const MRSaveIntegrity::FClassified Existing = MRSaveIntegrity::ClassifyFile(SlotFilePath());
		if (Existing.Kind == MRSaveIntegrity::EFileKind::Envelope || Existing.Kind == MRSaveIntegrity::EFileKind::LegacyValid)
		{
			const UMRAvatarSaveGame* Old = Cast<UMRAvatarSaveGame>(UGameplayStatics::LoadGameFromMemory(Existing.Payload)); // payload already proven well-formed
			if (Old && Old->SaveVersion > MRAvatarSave::CurrentSaveVersion) { OutError = TEXT("the slot holds a save from a newer version; refusing to overwrite it"); return false; }
		}
	}
	// Verified temp-file write + atomic replace; an existing legacy/unrecognised file is preserved as <file>.legacy.bak first.
	if (!MRSaveIntegrity::WriteEnvelopeAtomic(SlotFilePath(), Payload, OutError)) return false;
	UE_LOG(LogMoonRacer, Display, TEXT("MRAVATAR|SAVED|slot=%s|%s"), *GetSlotName(), *Save->Appearance.ToJsonString());
	OnAvatarSaved.Broadcast(Save->Appearance);
	return true;
}

bool UMRAvatarSaveSubsystem::MigrateSave(UMRAvatarSaveGame* Save, FMRAvatarLoadReport& Report)
{
	if (!Save) return false;
	Report.FromVersion = Save->SaveVersion;
	if (Save->SaveVersion > MRAvatarSave::CurrentSaveVersion)
	{
		Report.bRejectedNewerVersion = true;
		Report.Notes.Add(FString::Printf(TEXT("save version %d is newer than supported (%d); ignored"), Save->SaveVersion, MRAvatarSave::CurrentSaveVersion));
		return false;
	}
	while (Save->SaveVersion < MRAvatarSave::CurrentSaveVersion)
	{
		switch (Save->SaveVersion)
		{
		case 0: // v0 -> v1: single capitalised species + one optional accessory -> versioned appearance.
		{
			FMRAvatarAppearance A;
			A.SchemaVersion = 1;
			A.AvatarId = FGuid::NewGuid();
			A.SpeciesId = FName(*Save->LegacySpecies.ToString().ToLower());
			if (!Save->LegacyAccessory.IsNone()) A.AccessoryIds.Add(Save->LegacyAccessory);
			A.Revision = 1;
			Save->Appearance = A;
			Report.Notes.Add(TEXT("migrated v0 -> v1"));
			break;
		}
		default:
			Report.Notes.Add(FString::Printf(TEXT("no migration path from save version %d"), Save->SaveVersion));
			return false;
		}
		Save->SaveVersion++;
		Report.bMigrated = true;
	}
	return true;
}

FMRAvatarAppearance UMRAvatarSaveSubsystem::LoadAppearance(FMRAvatarLoadReport& OutReport)
{
	OutReport = FMRAvatarLoadReport();
	UMRAvatarCatalog* Catalog = GetCatalog();
	FMRAvatarAppearance Default = Catalog ? Catalog->MakeDefaultAppearance() : FMRAvatarAppearance();

	// Classify the file WITHOUT invoking the engine deserialiser. Only a verified envelope payload or a fully validated legacy file ever reaches it.
	const MRSaveIntegrity::FClassified File = MRSaveIntegrity::ClassifyFile(SlotFilePath());
	using EK = MRSaveIntegrity::EFileKind;
	if (File.Kind == EK::Missing) return Default;
	if (File.Kind != EK::Envelope && File.Kind != EK::LegacyValid)
	{
		OutReport.bRejectedMalformed = true;
		OutReport.IntegrityDetail = File.Why;
		OutReport.Notes.Add(FString::Printf(TEXT("save file rejected (%s); not loaded, preserved on disk; using defaults"), *File.Why));
		return Default;
	}
	OutReport.bLegacyFormat = (File.Kind == EK::LegacyValid);
	if (OutReport.bLegacyFormat) OutReport.Notes.Add(TEXT("legacy-format save validated structurally; it will be upgraded (original preserved as .legacy.bak) on the next save"));

	UMRAvatarSaveGame* Save = Cast<UMRAvatarSaveGame>(UGameplayStatics::LoadGameFromMemory(File.Payload));
	if (!Save) { OutReport.bRejectedMalformed = true; OutReport.Notes.Add(TEXT("save payload could not be deserialised; using defaults")); return Default; }
	OutReport.bFoundSave = true;

	if (!MigrateSave(Save, OutReport)) return Default;
	FMRAvatarAppearance A = Save->Appearance;
	if (Catalog)
	{
		OutReport.bSanitized = Catalog->Sanitize(A, OutReport.Notes);
		if (!Catalog->Validate(A).IsValid()) { OutReport.Notes.Add(TEXT("saved appearance invalid after sanitising; using defaults")); return Default; }
	}
	return A;
}
