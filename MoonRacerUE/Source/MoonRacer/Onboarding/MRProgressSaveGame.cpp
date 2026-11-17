#include "Onboarding/MRProgressSaveGame.h"
#include "HAL/FileManager.h"
#include "Kismet/GameplayStatics.h"
#include "Misc/FileHelper.h"
#include "Misc/CommandLine.h"
#include "Misc/Crc.h"
#include "Misc/Parse.h"
#include "Misc/Paths.h"
#include "MoonRacer.h"

namespace
{
	FString GBaseOverride;
	constexpr int32 UserIndex = 0;



	// ---- integrity envelope: "MRPG" | u32 format(1) | u32 payloadLen | u32 crc32(payload) | payload (SaveGameToMemory bytes) ----
	constexpr uint32 EnvelopeMagic = 0x4750524D; // 'M','R','P','G' little-endian
	constexpr uint32 EnvelopeFormat = 1;
	constexpr uint32 MaxPayload = 1 << 20;

	bool WriteEnvelope(const FString& Path, UMRProgressSaveGame* Save)
	{
		TArray<uint8> Payload;
		if (!UGameplayStatics::SaveGameToMemory(Save, Payload) || Payload.Num() == 0 || (uint32)Payload.Num() > MaxPayload) return false;
		TArray<uint8> File; File.SetNumUninitialized(16 + Payload.Num());
		const uint32 Header[4] = { EnvelopeMagic, EnvelopeFormat, (uint32)Payload.Num(), FCrc::MemCrc32(Payload.GetData(), Payload.Num()) };
		FMemory::Memcpy(File.GetData(), Header, 16);
		FMemory::Memcpy(File.GetData() + 16, Payload.GetData(), Payload.Num());
		const FString Tmp = Path + TEXT(".tmp");
		IFileManager::Get().MakeDirectory(*FPaths::GetPath(Path), true);
		if (!FFileHelper::SaveArrayToFile(File, *Tmp)) return false;
		return IFileManager::Get().Move(*Path, *Tmp, /*Replace*/ true, /*EvenIfReadOnly*/ true);
	}

	// Returns null (never crashes) for anything that is not a complete, checksummed envelope.
	UMRProgressSaveGame* ReadEnvelope(const FString& Path, FString& Why)
	{
		TArray<uint8> File;
		if (!FFileHelper::LoadFileToArray(File, *Path)) { Why = TEXT("unreadable"); return nullptr; }
		if (File.Num() < 16) { Why = TEXT("truncated"); return nullptr; }
		uint32 Header[4]; FMemory::Memcpy(Header, File.GetData(), 16);
		if (Header[0] != EnvelopeMagic) { Why = TEXT("not a progress file"); return nullptr; }
		if (Header[1] != EnvelopeFormat) { Why = TEXT("unknown envelope format"); return nullptr; }
		if (Header[2] == 0 || Header[2] > MaxPayload || (int64)Header[2] != (int64)File.Num() - 16) { Why = TEXT("bad length"); return nullptr; }
		if (FCrc::MemCrc32(File.GetData() + 16, Header[2]) != Header[3]) { Why = TEXT("payload CRC mismatch"); return nullptr; }
		TArray<uint8> Payload; Payload.Append(File.GetData() + 16, (int32)Header[2]); // CRC-verified bytes only reach the engine deserialiser
		return Cast<UMRProgressSaveGame>(UGameplayStatics::LoadGameFromMemory(Payload));
	}

	struct FCandidate
	{
		bool bExists = false;
		bool bValid = false;
		bool bNewer = false;
		int32 Generation = -1;      // readable generation even if the content is invalid (keeps generations monotonic)
		FMRProgressRecord Record;
		bool bMigrated = false;
		FString Why;
	};

	FCandidate Evaluate(bool bSlotB, TArray<FString>& Notes)
	{
		FCandidate C;
		const FString Name = FMRProgressStore::SlotName(bSlotB);
		const TCHAR* Tag = bSlotB ? TEXT("B") : TEXT("A");
		const FString Path = FMRProgressStore::SlotFilePath(bSlotB);
		if (!IFileManager::Get().FileExists(*Path)) { C.Why = TEXT("missing"); return C; }
		C.bExists = true;
		FString ReadWhy;
		UMRProgressSaveGame* S = ReadEnvelope(Path, ReadWhy);
		if (!S) { C.Why = TEXT("unreadable/corrupt file"); Notes.Add(FString::Printf(TEXT("slot %s: unreadable or corrupt (%s); ignored and preserved"), Tag, *ReadWhy)); return C; }
		C.Generation = S->WriteGeneration;
		if (S->SaveVersion > MROnboarding::CurrentProgressVersion)
		{
			C.bNewer = true; C.Why = TEXT("written by a newer version");
			Notes.Add(FString::Printf(TEXT("slot %s: version %d is newer than supported (%d); ignored and preserved"), Tag, S->SaveVersion, MROnboarding::CurrentProgressVersion));
			return C;
		}
		bool bMigrated = false;
		if (!FMRProgressStore::Migrate(S, Notes, bMigrated)) { C.Why = TEXT("migration failed"); return C; }
		C.bMigrated = bMigrated;
		if (!bMigrated) // migrated saves predate checksums
		{
			if (S->Checksum != FMRProgressStore::ComputeChecksum(S->WriteGeneration, S->Record))
			{
				C.Why = TEXT("checksum mismatch"); Notes.Add(FString::Printf(TEXT("slot %s: checksum mismatch (corrupted); ignored"), Tag)); return C;
			}
		}
		const TArray<FString> Problems = S->Record.Validate();
		if (Problems.Num() > 0)
		{
			C.Why = TEXT("invalid checkpoint");
			Notes.Add(FString::Printf(TEXT("slot %s: invalid checkpoint (%s); ignored"), Tag, *Problems[0]));
			return C;
		}
		C.bValid = true; C.Record = S->Record;
		return C;
	}
}

FString FMRProgressStore::SlotBase()
{
	if (!GBaseOverride.IsEmpty()) return GBaseOverride;
	FString FromCmd;
	if (FParse::Value(FCommandLine::Get(), TEXT("MRProgressSlot="), FromCmd) && !FromCmd.IsEmpty()) return FromCmd;
	return TEXT("MRProgress_Local");
}

void FMRProgressStore::SetSlotBaseOverride(const FString& Base) { GBaseOverride = Base; }

FString FMRProgressStore::SlotFilePath(bool bSlotB)
{
	return FPaths::ProjectSavedDir() / TEXT("SaveGames") / (SlotName(bSlotB) + TEXT(".sav"));
}

int32 FMRProgressStore::ComputeChecksum(int32 Generation, const FMRProgressRecord& Record)
{
	return (int32)FCrc::StrCrc32(*(FString::FromInt(Generation) + TEXT("#") + Record.ToCanonicalString()));
}

bool FMRProgressStore::Migrate(UMRProgressSaveGame* Save, TArray<FString>& Notes, bool& bMigrated)
{
	bMigrated = false;
	if (!Save) return false;
	while (Save->SaveVersion < MROnboarding::CurrentProgressVersion)
	{
		switch (Save->SaveVersion)
		{
		case 0: // v0 -> v1: a stage index (0..10) and one arrival flag -> versioned record with derived completion flags.
		{
			const int32 Idx = FMath::Clamp(Save->LegacyStageIndex, 0, (int32)EMROnboardingState::Count - 1);
			FMRProgressRecord R = FMRProgressRecord::MakeNew();
			R.CurrentState = MROnboarding::StateId((EMROnboardingState)Idx);
			const int32 I = Idx;
			R.Flags.bAccessResolved = I > (int32)EMROnboardingState::AccessCheck;
			R.Flags.bPassportChecked = I > (int32)EMROnboardingState::PassportCheck;
			R.Flags.bAvatarConfirmed = I > (int32)EMROnboardingState::AvatarCheck;
			R.Flags.bArrivalSeen = I > (int32)EMROnboardingState::ArrivalCinematic && Save->bLegacyArrivalSeen;
			R.Flags.bArrivalSkippedUnavailable = I > (int32)EMROnboardingState::ArrivalCinematic && !Save->bLegacyArrivalSeen;
			R.Flags.bCoreSpawned = I > (int32)EMROnboardingState::CoreSpawn;
			R.Flags.bFirstObjectiveDone = I > (int32)EMROnboardingState::FirstObjective;
			R.Flags.bTavianIntroduced = I > (int32)EMROnboardingState::TavianDialogue;
			R.Flags.bBartenderHandoff = I > (int32)EMROnboardingState::BartenderHandoff;
			// v0 had no avatar reference / safe spawn: records that need them become invalid and fall back (safe), never fabricated.
			Save->Record = R;
			Notes.Add(TEXT("migrated v0 -> v1"));
			break;
		}
		default:
			Notes.Add(FString::Printf(TEXT("no migration path from version %d"), Save->SaveVersion));
			return false;
		}
		Save->SaveVersion++;
		bMigrated = true;
	}
	return true;
}

FMRProgressStore::FSlotRead FMRProgressStore::ReadSlotV1(bool bSlotB)
{
	TArray<FString> Notes; const FCandidate C = Evaluate(bSlotB, Notes);
	FSlotRead R; R.bExists = C.bExists; R.bValid = C.bValid; R.bNewer = C.bNewer; R.bMigrated = C.bMigrated; R.Generation = C.Generation; R.Record = C.Record;
	R.Why = Notes.Num() ? Notes[0] : C.Why;
	return R;
}

UMRProgressSaveGame* FMRProgressStore::ReadSlotObject(bool bSlotB, FString& Why)
{
	const FString Path = SlotFilePath(bSlotB);
	if (!IFileManager::Get().FileExists(*Path)) { Why = TEXT("missing"); return nullptr; }
	return ReadEnvelope(Path, Why);
}

FMRProgressRecord FMRProgressStore::Load(FMRProgressLoadReport& R)
{
	R = FMRProgressLoadReport();
	const FCandidate A = Evaluate(false, R.Notes);
	const FCandidate B = Evaluate(true, R.Notes);
	R.bExistsA = A.bExists; R.bExistsB = B.bExists; R.bValidA = A.bValid; R.bValidB = B.bValid;
	R.GenerationA = A.Generation; R.GenerationB = B.Generation;
	R.bRejectedNewerVersion = A.bNewer || B.bNewer;

	const FCandidate* Best = nullptr;
	if (A.bValid && B.bValid) Best = (B.Generation > A.Generation) ? &B : &A;
	else if (A.bValid) Best = &A;
	else if (B.bValid) Best = &B;

	if (!Best)
	{
		R.bFallbackFresh = true;
		R.Notes.Add(A.bExists || B.bExists ? TEXT("no valid checkpoint in either slot; starting a fresh onboarding record") : TEXT("no saved progress; new player"));
		return FMRProgressRecord::MakeNew();
	}
	R.ChosenSlot = (Best == &B) ? TEXT("B") : TEXT("A");
	R.ChosenGeneration = Best->Generation;
	R.bMigrated = Best->bMigrated;
	if ((A.bExists && !A.bValid) || (B.bExists && !B.bValid)) R.Notes.Add(FString::Printf(TEXT("recovered from the latest valid checkpoint (slot %s, generation %d)"), *R.ChosenSlot, R.ChosenGeneration));
	return Best->Record;
}

FMRProgressSaveResult FMRProgressStore::Save(const FMRProgressRecord& Record)
{
	FMRProgressSaveResult Out;
	const TArray<FString> Problems = Record.Validate();
	if (Problems.Num() > 0) { Out.Error = TEXT("refusing to save an inconsistent record: ") + Problems[0]; return Out; }

	TArray<FString> Notes;
	const FCandidate A = Evaluate(false, Notes);
	const FCandidate B = Evaluate(true, Notes);
	const int32 MaxGen = FMath::Max3(0, A.Generation, B.Generation); // generations start at 1

	// Latest valid slot is kept intact; write to the other one.
	const FCandidate* Latest = nullptr;
	if (A.bValid && B.bValid) Latest = (B.Generation > A.Generation) ? &B : &A;
	else if (A.bValid) Latest = &A; else if (B.bValid) Latest = &B;
	bool bWriteB = (Latest == &A) ? true : (Latest == &B) ? false : false;
	// Never overwrite a save written by a newer build.
	const bool bTargetProtected = bWriteB ? B.bNewer : A.bNewer;
	if (bTargetProtected)
	{
		const bool bOtherProtected = bWriteB ? A.bNewer : B.bNewer;
		if (bOtherProtected || Latest != nullptr) { Out.Error = TEXT("refused: target slot holds a save from a newer version"); return Out; }
		bWriteB = !bWriteB;
	}

	UMRProgressSaveGame* S = NewObject<UMRProgressSaveGame>(GetTransientPackage());
	S->SaveVersion = MROnboarding::CurrentProgressVersion;
	S->WriteGeneration = MaxGen + 1;
	S->Record = Record;
	S->Checksum = ComputeChecksum(S->WriteGeneration, S->Record);
	if (!WriteEnvelope(SlotFilePath(bWriteB), S)) { Out.Error = TEXT("writing the checkpoint file failed"); return Out; }

	// Verify by reading back; only then does this write count.
	TArray<FString> VerifyNotes;
	const FCandidate V = Evaluate(bWriteB, VerifyNotes);
	if (!V.bValid || V.Generation != S->WriteGeneration || !(V.Record == Record)) { Out.Error = TEXT("read-back verification failed; previous checkpoint left intact"); return Out; }
	Out.bOk = true; Out.Slot = bWriteB ? TEXT("B") : TEXT("A"); Out.Generation = S->WriteGeneration;
	return Out;
}

void FMRProgressStore::DeleteBoth()
{
	for (bool bB : { false, true })
	{
		IFileManager::Get().Delete(*SlotFilePath(bB), false, true, true);
		IFileManager::Get().Delete(*(SlotFilePath(bB) + TEXT(".tmp")), false, true, true);
	}
}

bool FMRProgressStore::WriteSlotForTest(bool bSlotB, UMRProgressSaveGame* Save) { return WriteEnvelope(SlotFilePath(bSlotB), Save); }
