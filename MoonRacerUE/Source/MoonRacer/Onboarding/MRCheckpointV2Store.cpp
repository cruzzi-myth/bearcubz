#include "Onboarding/MRCheckpointV2Store.h"
#include "Avatar/MRAvatarSaveGame.h"
#include "HAL/FileManager.h"
#include "Kismet/GameplayStatics.h"
#include "Misc/Crc.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "MoonRacer.h"

FMRCheckpointV2Store::EFailPoint FMRCheckpointV2Store::GFailPoint = FMRCheckpointV2Store::EFailPoint::None;

namespace
{
	constexpr uint32 EnvMagic = 0x4750524D;   // 'M','R','P','G' - the same envelope as v1
	constexpr uint32 EnvFormat = 1;

	struct FCand
	{
		bool bExists = false, bValid = false, bNewer = false, bIsV2 = false, bMigrated = false;
		int32 Version = -1, Gen = -1;
		FMRProgressRecord V1; FMRCheckpointV2 V2; FString Why;
	};

	FCand ReadCand(bool bB)
	{
		FCand C; const FString Path = FMRProgressStore::SlotFilePath(bB);
		if (!IFileManager::Get().FileExists(*Path)) { C.Why = TEXT("missing"); return C; }
		C.bExists = true;
		FString Why; UMRProgressSaveGame* Obj = FMRProgressStore::ReadSlotObject(bB, Why);
		if (!Obj) { C.Why = TEXT("unreadable or corrupt (") + Why + TEXT(")"); return C; }
		C.Version = Obj->SaveVersion; C.Gen = Obj->WriteGeneration;
		if (Obj->SaveVersion > MROnboardingV2::CheckpointVersion) { C.bNewer = true; C.Why = TEXT("written by a newer version"); return C; }
		if (Obj->SaveVersion == MROnboardingV2::CheckpointVersion)
		{
			UMRProgressSaveGameV2* V2 = Cast<UMRProgressSaveGameV2>(Obj);
			if (!V2) { C.Why = TEXT("version 2 without the v2 payload"); return C; }
			if (V2->Checksum2 != MROnboardingV2::ComputeChecksum(V2->WriteGeneration, V2->RecordV2)) { C.Why = TEXT("v2 checksum mismatch"); return C; }
			const TArray<FString> P = V2->RecordV2.Validate();
			if (P.Num() > 0) { C.Why = TEXT("invalid v2 checkpoint: ") + P[0]; return C; }
			C.bValid = true; C.bIsV2 = true; C.V2 = V2->RecordV2; return C;
		}
		const FMRProgressStore::FSlotRead R = FMRProgressStore::ReadSlotV1(bB);   // v1 (and v0, migrated to v1) with its own checksum/validation
		C.bValid = R.bValid; C.bMigrated = R.bMigrated; C.V1 = R.Record; C.Gen = R.Generation >= 0 ? R.Generation : C.Gen; C.Why = R.Why;
		return C;
	}

	const FCand* Newest(const FCand& A, const FCand& B)
	{
		// P5B-3B: valid v2 progress is NEVER discarded merely because a v1 slot carries a higher generation. v2 wins a v2/v1 pair; the conflict is reported by Load.
		if (A.bValid && B.bValid) { if (A.bIsV2 != B.bIsV2) return A.bIsV2 ? &A : &B; if (A.Gen != B.Gen) return A.Gen > B.Gen ? &A : &B; return &B; }
		return A.bValid ? &A : B.bValid ? &B : nullptr;
	}

	TArray<uint8> MakeFile(UMRProgressSaveGameV2* S)
	{
		TArray<uint8> Payload, File;
		if (!UGameplayStatics::SaveGameToMemory(S, Payload) || Payload.Num() == 0 || Payload.Num() > (1 << 20)) return File;
		File.SetNumUninitialized(16 + Payload.Num());
		const uint32 H[4] = { EnvMagic, EnvFormat, (uint32)Payload.Num(), FCrc::MemCrc32(Payload.GetData(), Payload.Num()) };
		FMemory::Memcpy(File.GetData(), H, 16); FMemory::Memcpy(File.GetData() + 16, Payload.GetData(), Payload.Num());
		return File;
	}

	UMRProgressSaveGameV2* MakeObject(int32 Gen, const FMRCheckpointV2& R)
	{
		UMRProgressSaveGameV2* S = NewObject<UMRProgressSaveGameV2>(GetTransientPackage());
		S->SaveVersion = MROnboardingV2::CheckpointVersion; S->WriteGeneration = Gen; S->RecordV2 = R; S->Checksum2 = MROnboardingV2::ComputeChecksum(Gen, R);
		return S;
	}

	// Copy (never move) a non-v2 slot file to the first free backup name; if an identical backup already exists nothing is created.
	bool EnsureBackup(bool bB, TArray<FString>& Created, FString& Err)
	{
		const FString Path = FMRProgressStore::SlotFilePath(bB);
		if (!IFileManager::Get().FileExists(*Path)) return true;
		TArray<uint8> Bytes; if (!FFileHelper::LoadFileToArray(Bytes, *Path)) { Err = TEXT("cannot read the slot file to back it up"); return false; }
		for (int32 N = 0; N < 1000; ++N)
		{
			const FString Bak = FMRCheckpointV2Store::BackupPath(bB, N);
			if (!IFileManager::Get().FileExists(*Bak))
			{
				if (IFileManager::Get().Copy(*Bak, *Path) != COPY_OK) { Err = TEXT("backup copy failed"); return false; }
				TArray<uint8> Back; if (!FFileHelper::LoadFileToArray(Back, *Bak) || Back != Bytes) { Err = TEXT("backup verification failed"); return false; }
				Created.Add(Bak); return true;
			}
			TArray<uint8> Existing; if (FFileHelper::LoadFileToArray(Existing, *Bak) && Existing == Bytes) return true;   // already preserved; never overwritten
		}
		Err = TEXT("too many backups"); return false;
	}
}

FString FMRCheckpointV2Store::BackupPath(bool bB, int32 N)
{
	return FMRProgressStore::SlotFilePath(bB) + (N == 0 ? FString(TEXT(".v1.bak")) : FString::Printf(TEXT(".v1.%d.bak"), N));
}

TArray<FString> FMRCheckpointV2Store::ListBackups(bool bB)
{
	TArray<FString> Out; for (int32 N = 0; N < 1000; ++N) { const FString P = BackupPath(bB, N); if (IFileManager::Get().FileExists(*P)) Out.Add(P); else if (N > 0) break; }
	return Out;
}

FMRCheckpointV2 FMRCheckpointV2Store::Load(const FMRMigrationContext& Ctx, FMRV2LoadReport& R)
{
	R = FMRV2LoadReport();
	const FCand A = ReadCand(false), B = ReadCand(true);
	R.bExistsA = A.bExists; R.bExistsB = B.bExists; R.bValidA = A.bValid; R.bValidB = B.bValid; R.bNewerA = A.bNewer; R.bNewerB = B.bNewer;
	R.VersionA = A.Version; R.VersionB = B.Version; R.GenerationA = A.Gen; R.GenerationB = B.Gen;
	R.bRejectedNewerVersion = A.bNewer || B.bNewer;
	if (A.bNewer) R.Notes.Add(TEXT("slot A holds a save from a newer version: not loaded, preserved"));
	if (B.bNewer) R.Notes.Add(TEXT("slot B holds a save from a newer version: not loaded, preserved"));
	if (A.bExists && !A.bValid && !A.bNewer) R.Notes.Add(TEXT("slot A is not a valid checkpoint (") + A.Why + TEXT("): ignored and preserved"));
	if (B.bExists && !B.bValid && !B.bNewer) R.Notes.Add(TEXT("slot B is not a valid checkpoint (") + B.Why + TEXT("): ignored and preserved"));

	const FCand* Best = Newest(A, B);
	if (!Best) { R.bFallbackFresh = true; R.Notes.Add(A.bExists || B.bExists ? TEXT("no valid checkpoint in either slot; a fresh v2 record is used (nothing was modified)") : TEXT("no saved progress; new player")); return FMRCheckpointV2::MakeNew(); }
	R.ChosenSlot = (Best == &B) ? TEXT("B") : TEXT("A"); R.ChosenGeneration = Best->Gen;
	if (A.bValid && B.bValid && A.bIsV2 != B.bIsV2)
	{
		// mixed v1/v2 pair: keep BOTH. The other slot is migrated in memory purely so the difference can be reported; nothing is written.
		const FCand& Other = Best == &A ? B : A;
		R.AlternateMigration = MROnboardingV2::MigrateV1ToV2(Other.V1, Ctx);
		if (Other.Gen > Best->Gen)
		{
			R.bMixedConflict = true;
			const EMROnboardingStateV2 V2At = MROnboardingV2::FirstIncompleteState(Best->V2), V1At = MROnboardingV2::FirstIncompleteState(R.AlternateMigration.Record);
			R.Notes.Add(FString::Printf(TEXT("CONFLICT: a valid v1 slot (generation %d, would resume at %s) has a higher generation than the valid v2 slot (generation %d, resumes at %s): the v2 progress is kept and BOTH files are preserved; nothing is merged or discarded"),
				Other.Gen, *MROnboardingV2::StateId(V1At).ToString(), Best->Gen, *MROnboardingV2::StateId(V2At).ToString()));
		}
		else R.Notes.Add(TEXT("a valid v2 slot and an older valid v1 slot coexist: v2 is used; the v1 file is preserved (it is backed up before it is ever replaced)"));
	}
	if (Best->bIsV2) { R.SourceVersion = 2; return Best->V2; }
	R.SourceVersion = 1; R.bMigrated = true;
	R.Migration = MROnboardingV2::MigrateV1ToV2(Best->V1, Ctx);
	R.Notes.Append(R.Migration.Notes);
	R.Notes.Add(TEXT("a v1 checkpoint was migrated IN MEMORY only: no file was written and no backup was made"));
	return R.Migration.Record;
}

FMRV2SaveResult FMRCheckpointV2Store::Save(const FMRCheckpointV2& Record)
{
	FMRV2SaveResult Out;
	if (FMRProgressStore::SlotBase() == DefaultSlotBase()) { Out.Error = TEXT("refused: v2 persistence is not activated for the default player slot"); return Out; }
	const TArray<FString> Problems = Record.Validate();
	if (Problems.Num() > 0) { Out.Error = TEXT("refusing to save an inconsistent v2 record: ") + Problems[0]; return Out; }

	const FCand A = ReadCand(false), B = ReadCand(true);
	const int32 MaxGen = FMath::Max3(0, A.Gen, B.Gen);
	const FCand* Latest = Newest(A, B);
	bool bWriteB = (Latest == &A);
	const FCand& Target = bWriteB ? B : A;
	if (Target.bNewer)
	{
		const bool bOtherNewer = bWriteB ? A.bNewer : B.bNewer;
		if (bOtherNewer || Latest != nullptr) { Out.Error = TEXT("refused: the target slot holds a save from a newer version"); return Out; }
		bWriteB = !bWriteB;
	}
	const FCand& T = bWriteB ? B : A;

	// ---- backups: first v2 write preserves BOTH existing non-v2 slot files; later writes preserve a non-v2 file about to be replaced
	const bool bFirstV2 = !(A.bValid && A.bIsV2) && !(B.bValid && B.bIsV2);
	FString Err;
	if (bFirstV2)
	{
		if (A.bExists && !A.bNewer && !EnsureBackup(false, Out.BackupsCreated, Err)) { Out.Error = TEXT("backup failed; nothing was written: ") + Err; return Out; }
		if (B.bExists && !B.bNewer && !EnsureBackup(true, Out.BackupsCreated, Err)) { Out.Error = TEXT("backup failed; nothing was written: ") + Err; return Out; }
	}
	else if (T.bExists && !T.bNewer && !(T.bValid && T.bIsV2) && !EnsureBackup(bWriteB, Out.BackupsCreated, Err)) { Out.Error = TEXT("backup failed; nothing was written: ") + Err; return Out; }
	if (GFailPoint == EFailPoint::AfterBackup) { Out.Error = TEXT("simulated failure after the backups"); return Out; }

	const int32 Gen = MaxGen + 1;
	const TArray<uint8> File = MakeFile(MakeObject(Gen, Record));
	if (File.Num() == 0) { Out.Error = TEXT("serialisation failed"); return Out; }
	const FString Path = FMRProgressStore::SlotFilePath(bWriteB), Tmp = Path + TEXT(".tmp");
	IFileManager::Get().MakeDirectory(*FPaths::GetPath(Path), true);
	if (GFailPoint == EFailPoint::TornTargetWrite)
	{ TArray<uint8> Half; Half.Append(File.GetData(), File.Num() / 2); FFileHelper::SaveArrayToFile(Half, *Path); Out.Error = TEXT("simulated torn write to the target slot"); return Out; }
	if (!FFileHelper::SaveArrayToFile(File, *Tmp)) { Out.Error = TEXT("temp write failed"); return Out; }
	if (GFailPoint == EFailPoint::AfterTempWrite) { Out.Error = TEXT("simulated interruption after the temp write"); return Out; }   // tmp left behind; the real files are untouched
	if (!IFileManager::Get().Move(*Path, *Tmp, true, true)) { Out.Error = TEXT("atomic replace failed"); return Out; }

	const FCand V = ReadCand(bWriteB);
	if (!V.bValid || !V.bIsV2 || V.Gen != Gen || !(V.V2 == Record)) { Out.Error = TEXT("read-back verification failed; the previous checkpoint is left intact"); return Out; }
	Out.bOk = true; Out.Slot = bWriteB ? TEXT("B") : TEXT("A"); Out.Generation = Gen;
	return Out;
}

bool FMRCheckpointV2Store::WriteSlotV2ForTest(bool bSlotB, int32 Generation, const FMRCheckpointV2& Record)
{
	const TArray<uint8> File = MakeFile(MakeObject(Generation, Record));
	const FString Path = FMRProgressStore::SlotFilePath(bSlotB);
	IFileManager::Get().MakeDirectory(*FPaths::GetPath(Path), true);
	return File.Num() > 0 && FFileHelper::SaveArrayToFile(File, *Path);
}

FMRSaveEvidence FMRCheckpointV2Store::GatherSaveEvidence(UMRAvatarSaveSubsystem* Avatar, const FMRMigrationMap& Map)
{
	FMRSaveEvidence E; E.Map = Map;
	if (Avatar)
	{
		FMRAvatarLoadReport LR; const FMRAvatarAppearance App = Avatar->LoadAppearance(LR);
		E.Avatar.bChecked = true; E.Avatar.bMalformedPreserved = LR.bRejectedMalformed; E.Avatar.bNewerRejected = LR.bRejectedNewerVersion;
		E.Avatar.bValid = LR.bFoundSave && !LR.bRejectedMalformed && !LR.bRejectedNewerVersion;
		if (E.Avatar.bValid) { E.Avatar.AvatarId = App.AvatarId; E.Avatar.Revision = App.Revision; }
	}
	FMRNarrativeLoadReport NR; const FMRNarrativeState S = FMRNarrativeStore::Load(NR);
	if (NR.bValid) E.Narrative = FMRNarrativeEvidence::From(S);
	return E;
}
