#include "Narrative/MRNarrativeSaveGame.h"
#include "HAL/FileManager.h"
#include "Kismet/GameplayStatics.h"
#include "Misc/CommandLine.h"
#include "Misc/Crc.h"
#include "Misc/FileHelper.h"
#include "Misc/Parse.h"
#include "Misc/Paths.h"
#include "MoonRacer.h"

namespace
{
	FString GBase;
	constexpr uint32 Magic = 0x564E524D;   // 'M','R','N','V' little-endian
	constexpr uint32 Format = 1;
	constexpr uint32 MaxPayload = 1u << 20;

	TArray<FName> SortedNames(const TSet<FName>& S) { TArray<FName> A = S.Array(); A.Sort([](const FName& L, const FName& R) { return L.ToString() < R.ToString(); }); return A; }
	FString Join(const TSet<FName>& S) { FString R; for (FName N : SortedNames(S)) R += N.ToString() + TEXT(","); return R; }

	TArray<uint8> MakeFile(UMRNarrativeSaveGame* Save)
	{
		TArray<uint8> Payload, File;
		if (!UGameplayStatics::SaveGameToMemory(Save, Payload) || Payload.Num() == 0 || (uint32)Payload.Num() > MaxPayload) return File;
		File.SetNumUninitialized(16 + Payload.Num());
		const uint32 H[4] = { Magic, Format, (uint32)Payload.Num(), FCrc::MemCrc32(Payload.GetData(), Payload.Num()) };
		FMemory::Memcpy(File.GetData(), H, 16); FMemory::Memcpy(File.GetData() + 16, Payload.GetData(), Payload.Num());
		return File;
	}

	// Null (never a crash) for anything that is not a complete, checksummed envelope.
	UMRNarrativeSaveGame* ReadFile(const FString& Path, FString& Why)
	{
		TArray<uint8> F;
		if (!FFileHelper::LoadFileToArray(F, *Path)) { Why = TEXT("unreadable"); return nullptr; }
		if (F.Num() < 16) { Why = TEXT("truncated"); return nullptr; }
		uint32 H[4]; FMemory::Memcpy(H, F.GetData(), 16);
		if (H[0] != Magic) { Why = TEXT("not a narrative save"); return nullptr; }
		if (H[1] != Format) { Why = TEXT("unknown envelope format"); return nullptr; }
		if (H[2] == 0 || H[2] > MaxPayload || (int64)H[2] != (int64)F.Num() - 16) { Why = TEXT("bad length"); return nullptr; }
		if (FCrc::MemCrc32(F.GetData() + 16, H[2]) != H[3]) { Why = TEXT("payload CRC mismatch"); return nullptr; }
		TArray<uint8> P; P.Append(F.GetData() + 16, (int32)H[2]);
		return Cast<UMRNarrativeSaveGame>(UGameplayStatics::LoadGameFromMemory(P));
	}

	bool WriteAtomic(const FString& Path, const TArray<uint8>& File, FString& Err)
	{
		if (File.Num() == 0) { Err = TEXT("serialisation failed"); return false; }
		const FString Tmp = Path + TEXT(".tmp");
		IFileManager::Get().MakeDirectory(*FPaths::GetPath(Path), true);
		if (!FFileHelper::SaveArrayToFile(File, *Tmp)) { Err = TEXT("temp write failed"); return false; }
		TArray<uint8> Back; FString Why;
		if (!FFileHelper::LoadFileToArray(Back, *Tmp) || Back != File) { Err = TEXT("temp verification failed"); IFileManager::Get().Delete(*Tmp); return false; }
		if (FMRNarrativeStore::GFailAfterTempWrite) { Err = TEXT("simulated failure after temp write"); return false; } // previous file untouched; tmp left behind
		if (!IFileManager::Get().Move(*Path, *Tmp, true, true)) { Err = TEXT("atomic replace failed"); return false; }
		return true;
	}

	// An existing file we cannot read as a valid current save is never overwritten without being preserved first.
	void PreserveUnreadable(const FString& Path)
	{
		if (!IFileManager::Get().FileExists(*Path)) return;
		FString Why;
		if (UMRNarrativeSaveGame* S = ReadFile(Path, Why)) { if (S->SaveVersion <= MRNarrative::CurrentNarrativeSaveVersion) return; }
		TArray<uint8> Cur; FFileHelper::LoadFileToArray(Cur, *Path);
		for (int32 I = 0; I < 1000; ++I)
		{
			const FString Bak = Path + (I == 0 ? TEXT(".bak") : *FString::Printf(TEXT(".%d.bak"), I));
			if (!IFileManager::Get().FileExists(*Bak)) { IFileManager::Get().Copy(*Bak, *Path); return; }
			TArray<uint8> B; if (FFileHelper::LoadFileToArray(B, *Bak) && B == Cur) return; // already preserved
		}
	}
}

bool FMRNarrativeStore::GFailAfterTempWrite = false;

FString FMRNarrativeState::ToCanonicalString() const
{
	FString M; TArray<FName> Keys; Missions.GetKeys(Keys); Keys.Sort([](const FName& L, const FName& R) { return L.ToString() < R.ToString(); });
	for (FName K : Keys) M += FString::Printf(TEXT("%s=%d,"), *K.ToString(), (int32)Missions[K]);
	return FString::Printf(TEXT("F[%s]D[%s]E[%s]O[%s]M[%s]"), *Join(Facts), *Join(CompletedDialogues), *Join(FiredEffects), *Join(CompletedObjectives), *M);
}

void UMRNarrativeSaveGame::FromState(const FMRNarrativeState& S)
{
	Facts = SortedNames(S.Facts); CompletedDialogues = SortedNames(S.CompletedDialogues); FiredEffects = SortedNames(S.FiredEffects); CompletedObjectives = SortedNames(S.CompletedObjectives);
	Missions.Reset();
	TArray<FName> Keys; S.Missions.GetKeys(Keys); Keys.Sort([](const FName& L, const FName& R) { return L.ToString() < R.ToString(); });
	for (FName K : Keys) { FMRMissionProgress P; P.MissionId = K; P.Status = S.Missions[K]; Missions.Add(P); }
}

FMRNarrativeState UMRNarrativeSaveGame::ToState() const
{
	FMRNarrativeState S;
	S.Facts.Append(Facts); S.CompletedDialogues.Append(CompletedDialogues); S.FiredEffects.Append(FiredEffects); S.CompletedObjectives.Append(CompletedObjectives);
	for (const FMRMissionProgress& P : Missions) S.Missions.Add(P.MissionId, P.Status);
	return S;
}

int32 UMRNarrativeSaveGame::ComputeChecksum() const
{
	return (int32)FCrc::StrCrc32(*(FString::FromInt(SaveVersion) + TEXT("#") + QuestRegistryVersion.ToString() + TEXT("#") + DialogueVersion.ToString() + TEXT("#") + ToState().ToCanonicalString()));
}

FString FMRNarrativeStore::SlotBase()
{
	if (!GBase.IsEmpty()) return GBase;
	FString V; if (FParse::Value(FCommandLine::Get(), TEXT("MRNarrativeSlot="), V) && !V.IsEmpty()) return V;
	return TEXT("MRNarrative_Local");
}
void FMRNarrativeStore::SetSlotBaseOverride(const FString& Base) { GBase = Base; }
FString FMRNarrativeStore::FilePath() { return FPaths::ProjectSavedDir() / TEXT("SaveGames") / (SlotBase() + TEXT(".sav")); }

FMRNarrativeState FMRNarrativeStore::Load(FMRNarrativeLoadReport& R)
{
	R = FMRNarrativeLoadReport();
	const FString Path = FilePath();
	if (!IFileManager::Get().FileExists(*Path)) { R.Why = TEXT("no narrative save (fresh)"); return FMRNarrativeState(); }
	R.bExists = true;
	FString Why;
	UMRNarrativeSaveGame* S = ReadFile(Path, Why);
	if (!S) { R.bCorrupt = true; R.Why = TEXT("unreadable or corrupt (") + Why + TEXT("); not loaded, preserved on disk"); return FMRNarrativeState(); }
	if (S->SaveVersion > MRNarrative::CurrentNarrativeSaveVersion) { R.bRejectedNewer = true; R.Why = FString::Printf(TEXT("written by a newer version (%d > %d); not loaded, preserved on disk"), S->SaveVersion, MRNarrative::CurrentNarrativeSaveVersion); return FMRNarrativeState(); }
	if (S->Checksum != S->ComputeChecksum()) { R.bCorrupt = true; R.Why = TEXT("checksum mismatch; not loaded, preserved on disk"); return FMRNarrativeState(); }
	R.bValid = true; R.SavedQuestVersion = S->QuestRegistryVersion; R.SavedDialogueVersion = S->DialogueVersion; R.Why = TEXT("loaded");
	return S->ToState();
}

bool FMRNarrativeStore::Save(const FMRNarrativeState& State, FName QuestVersion, FName DialogueVersion, FString& Err)
{
	const FString Path = FilePath();
	// Never overwrite a save written by a NEWER build.
	if (IFileManager::Get().FileExists(*Path)) { FString W; if (UMRNarrativeSaveGame* Old = ReadFile(Path, W)) { if (Old->SaveVersion > MRNarrative::CurrentNarrativeSaveVersion) { Err = TEXT("slot holds a save from a newer version; refusing to overwrite it"); return false; } } }
	PreserveUnreadable(Path);
	UMRNarrativeSaveGame* S = NewObject<UMRNarrativeSaveGame>(GetTransientPackage());
	S->QuestRegistryVersion = QuestVersion; S->DialogueVersion = DialogueVersion; S->FromState(State); S->Checksum = S->ComputeChecksum();
	return WriteAtomic(Path, MakeFile(S), Err);
}

void FMRNarrativeStore::Delete() { IFileManager::Get().Delete(*FilePath(), false, true, true); IFileManager::Get().Delete(*(FilePath() + TEXT(".tmp")), false, true, true); }

bool FMRNarrativeStore::WriteForTest(UMRNarrativeSaveGame* Save)
{
	FString Err; return WriteAtomic(FilePath(), MakeFile(Save), Err);
}
