// Moon Racer - avatar save integrity tests (Phase 3A maintenance). Dedicated test slot only.
//   UnrealEditor-Cmd MoonRacer.uproject -ExecCmds="Automation RunTests MoonRacer.AvatarSave; Quit" -unattended -nullrhi
#include "Misc/AutomationTest.h"

#if WITH_DEV_AUTOMATION_TESTS

#include "Avatar/MRAvatarCatalog.h"
#include "Avatar/MRAvatarSaveGame.h"
#include "Avatar/MRSaveIntegrity.h"
#include "Engine/GameInstance.h"
#include "HAL/FileManager.h"
#include "Kismet/GameplayStatics.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "UObject/StrongObjectPtr.h"

namespace
{
	constexpr EAutomationTestFlags TestFlags = EAutomationTestFlags::EditorContext | EAutomationTestFlags::ProductFilter;
	const TCHAR* TestSlot = TEXT("MRAvatar_IntegrityAutomation");
	using namespace MRSaveIntegrity;

	struct FFix
	{
		TStrongObjectPtr<UGameInstance> GI; TStrongObjectPtr<UMRAvatarSaveSubsystem> S; UMRAvatarCatalog* Cat = nullptr; int32 SavedEvents = 0;
		FDelegateHandle H;
		~FFix() { if (S.IsValid() && H.IsValid()) S->OnAvatarSaved.Remove(H); }
	};

	FString Path() { return UMRAvatarSaveSubsystem::SlotFilePath(); }

	void CleanSlot()
	{
		UMRAvatarSaveSubsystem::SetSlotNameOverride(TestSlot);
		const FString P = Path();
		IFileManager::Get().Delete(*P, false, true, true); IFileManager::Get().Delete(*(P + TEXT(".tmp")), false, true, true);
		TArray<FString> Baks; IFileManager::Get().FindFiles(Baks, *(FPaths::GetPath(P) / (FString(TestSlot) + TEXT(".sav.legacy*.bak"))), true, false);
		for (const FString& B : Baks) IFileManager::Get().Delete(*(FPaths::GetPath(P) / B), false, true, true);
	}

	void MakeFix(FFix& F)
	{
		CleanSlot();
		F.GI.Reset(NewObject<UGameInstance>(GetTransientPackage()));
		F.S.Reset(NewObject<UMRAvatarSaveSubsystem>(F.GI.Get()));
		F.Cat = UMRAvatarCatalog::LoadDefault();
		F.S->SetCatalogOverride(F.Cat);
		F.H = F.S->OnAvatarSaved.AddLambda([&F](const FMRAvatarAppearance&) { ++F.SavedEvents; });
	}

	FMRAvatarAppearance Good(UMRAvatarCatalog* C, int32 Rev = 3)
	{
		FMRAvatarAppearance A = C->MakeDefaultAppearance();
		A.SpeciesId = FName("mythraxian"); A.BodyBaseId = FName("dev_quinn"); A.MaterialVariantId = FName("dev_alt");
		A.AccessoryIds = { FName("dev_marker_head_top"), FName("dev_marker_hand_r_grip") }; A.Revision = Rev;
		return A;
	}

	// A genuine LEGACY file: written by the engine's own slot writer, exactly like Phase 3A did.
	TArray<uint8> WriteLegacy(const FMRAvatarAppearance& A, int32 SaveVersion = MRAvatarSave::CurrentSaveVersion, FName LegacySpecies = NAME_None)
	{
		UMRAvatarSaveGame* O = NewObject<UMRAvatarSaveGame>(GetTransientPackage()); O->SaveVersion = SaveVersion; O->Appearance = A; O->LegacySpecies = LegacySpecies;
		TArray<uint8> Bytes; UGameplayStatics::SaveGameToMemory(O, Bytes); FFileHelper::SaveArrayToFile(Bytes, *Path()); return Bytes;
	}

	TArray<uint8> Read() { TArray<uint8> B; FFileHelper::LoadFileToArray(B, *Path()); return B; }
	void Write(const TArray<uint8>& B) { FFileHelper::SaveArrayToFile(B, *Path()); }
	bool Equal(const TArray<uint8>& A, const TArray<uint8>& B) { return A == B; }

	// Load through the REAL path; returns true when the result is a valid, usable appearance (never crashes).
	bool LoadIsSafe(FFix& F, FMRAvatarLoadReport& R) { const FMRAvatarAppearance A = F.S->LoadAppearance(R); return F.Cat->Validate(A).IsValid(); }

	TArray<uint8> Envelope(const TArray<uint8>& Payload, uint32 Fmt = EnvelopeFormat) { return MakeEnvelope(Payload, Fmt); }
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRSaveCurrentTest, "MoonRacer.AvatarSave.CurrentFormat.RoundTripAtomicAndEvent", TestFlags)
bool FMRSaveCurrentTest::RunTest(const FString&)
{
	FFix F; MakeFix(F);
	if (!TestNotNull(TEXT("catalog"), F.Cat)) return false;
	const FMRAvatarAppearance A = Good(F.Cat);
	FString Err; TestTrue(TEXT("save ok"), F.S->SaveAppearance(A, Err));
	TestEqual(TEXT("saved event fired once (Avatar Creator completion signal)"), F.SavedEvents, 1);
	const TArray<uint8> B = Read();
	uint32 Magic = 0; if (B.Num() >= 4) FMemory::Memcpy(&Magic, B.GetData(), 4);
	TestEqual(TEXT("file carries the envelope magic"), Magic, AvatarMagic);
	TestEqual(TEXT("classified as a valid envelope"), (int32)ClassifyFile(Path()).Kind, (int32)EFileKind::Envelope);
	TestFalse(TEXT("no temp file left behind"), IFileManager::Get().FileExists(*(Path() + TEXT(".tmp"))));
	FMRAvatarLoadReport R; const FMRAvatarAppearance L = F.S->LoadAppearance(R);
	TestTrue(TEXT("round trip equal"), L == A);
	TestTrue(TEXT("found, current format, not rejected"), R.bFoundSave && !R.bLegacyFormat && !R.bRejectedMalformed);
	const FMRAvatarAppearance A2 = Good(F.Cat, 4);
	TestTrue(TEXT("second save replaces atomically"), F.S->SaveAppearance(A2, Err) && !IFileManager::Get().FileExists(*(Path() + TEXT(".tmp"))));
	TestTrue(TEXT("latest wins"), F.S->LoadAppearance(R) == A2);
	TestEqual(TEXT("two events for two saves"), F.SavedEvents, 2);
	TestEqual(TEXT("no backups created for current-format replacement"), (int32)IFileManager::Get().FileExists(*(Path() + TEXT(".legacy.bak"))), 0);
	CleanSlot(); return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRSaveLegacyTest, "MoonRacer.AvatarSave.Legacy.ValidLegacyLoadsAndIsPreserved", TestFlags)
bool FMRSaveLegacyTest::RunTest(const FString&)
{
	FFix F; MakeFix(F);
	const FMRAvatarAppearance A = Good(F.Cat);
	const TArray<uint8> Legacy = WriteLegacy(A);
	TestEqual(TEXT("legacy file is recognised as valid legacy"), (int32)ClassifyFile(Path()).Kind, (int32)EFileKind::LegacyValid);
	FMRAvatarLoadReport R; const FMRAvatarAppearance L = F.S->LoadAppearance(R);
	TestTrue(TEXT("legacy save loads"), R.bFoundSave && R.bLegacyFormat && !R.bRejectedMalformed && L == A);
	TestTrue(TEXT("loading never rewrites the legacy file"), Equal(Read(), Legacy));

	// First save after a legacy load preserves the original byte-for-byte, then upgrades.
	const FMRAvatarAppearance A2 = Good(F.Cat, 9);
	FString Err; TestTrue(TEXT("save over legacy ok"), F.S->SaveAppearance(A2, Err));
	TArray<uint8> Bak; FFileHelper::LoadFileToArray(Bak, *(Path() + TEXT(".legacy.bak")));
	TestTrue(TEXT("original legacy file preserved byte-identical as .legacy.bak"), Equal(Bak, Legacy));
	TestEqual(TEXT("main file upgraded to the envelope"), (int32)ClassifyFile(Path()).Kind, (int32)EFileKind::Envelope);
	TestTrue(TEXT("upgraded save loads the new data"), F.S->LoadAppearance(R) == A2 && !R.bLegacyFormat);
	TestTrue(TEXT("backup still there afterwards"), IFileManager::Get().FileExists(*(Path() + TEXT(".legacy.bak"))));

	// A second legacy -> save cycle never overwrites the existing backup.
	WriteLegacy(Good(F.Cat, 11));
	TestTrue(TEXT("second legacy save ok"), F.S->SaveAppearance(Good(F.Cat, 12), Err));
	TestTrue(TEXT("a second distinct backup was created"), IFileManager::Get().FileExists(*(Path() + TEXT(".legacy.1.bak"))));
	TArray<uint8> Bak0; FFileHelper::LoadFileToArray(Bak0, *(Path() + TEXT(".legacy.bak")));
	TestTrue(TEXT("first backup untouched"), Equal(Bak0, Legacy));

	// Legacy v0 (SaveVersion 0, capitalised single species) loads through the same path and migrates.
	CleanSlot(); MakeFix(F);
	WriteLegacy(FMRAvatarAppearance(), 0, FName("Human"));
	const FMRAvatarAppearance M = F.S->LoadAppearance(R);
	TestTrue(TEXT("v0 legacy migrated"), R.bFoundSave && R.bLegacyFormat && R.FromVersion == 0 && M.SpeciesId == FName("human"));
	CleanSlot(); return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRSaveMalformedTest, "MoonRacer.AvatarSave.Malformed.EmptyTruncatedGarbage", TestFlags)
bool FMRSaveMalformedTest::RunTest(const FString&)
{
	FFix F; MakeFix(F);
	FMRAvatarLoadReport R;
	// empty file
	Write(TArray<uint8>());
	TestEqual(TEXT("empty file is garbage"), (int32)ClassifyFile(Path()).Kind, (int32)EFileKind::Garbage);
	TestTrue(TEXT("empty file: safe default, flagged"), LoadIsSafe(F, R) && R.bRejectedMalformed && !R.bFoundSave);
	TestTrue(TEXT("empty file still on disk"), IFileManager::Get().FileExists(*Path()));

	// the exact bytes that crashed the engine's loader earlier
	const TArray<uint8> Junk = { 0xDE, 0xAD, 0xBE, 0xEF, 0x00, 0x13, 0x37 };
	Write(Junk); TestTrue(TEXT("original crash bytes: no crash, rejected"), LoadIsSafe(F, R) && R.bRejectedMalformed); TestTrue(TEXT("preserved"), Equal(Read(), Junk));

	// every truncation of a valid ENVELOPE and of a valid LEGACY file
	FString Err; F.S->SaveAppearance(Good(F.Cat), Err); const TArray<uint8> Env = Read();
	int32 EnvAccepted = 0; for (int32 N = 0; N < Env.Num(); ++N) { TArray<uint8> T; T.Append(Env.GetData(), N); if (ClassifyBytes(T).Kind == EFileKind::Envelope) ++EnvAccepted; }
	TestEqual(TEXT("no truncation of an envelope is accepted"), EnvAccepted, 0);
	CleanSlot(); MakeFix(F);
	const TArray<uint8> Leg = WriteLegacy(Good(F.Cat));
	int32 LegAccepted = 0; for (int32 N = 0; N < Leg.Num(); ++N) { TArray<uint8> T; T.Append(Leg.GetData(), N); if (ClassifyBytes(T).Kind == EFileKind::LegacyValid) ++LegAccepted; }
	TestEqual(TEXT("no truncation of a legacy save is accepted"), LegAccepted, 0);
	// full (real) loads on a spread of truncations
	for (int32 N = 0; N < Leg.Num(); N += 37) { TArray<uint8> T; T.Append(Leg.GetData(), N); Write(T); TestTrue(*FString::Printf(TEXT("truncated legacy @%d loads safely"), N), LoadIsSafe(F, R) && R.bRejectedMalformed); }
	for (int32 N = 0; N < Env.Num(); N += 29) { TArray<uint8> T; T.Append(Env.GetData(), N); Write(T); TestTrue(*FString::Printf(TEXT("truncated envelope @%d loads safely"), N), LoadIsSafe(F, R) && R.bRejectedMalformed); }

	// random garbage
	FRandomStream Rnd(1234); int32 GarbageAccepted = 0;
	for (int32 i = 0; i < 1500; ++i) { TArray<uint8> G; G.SetNum(Rnd.RandRange(0, 3000)); for (uint8& B : G) B = (uint8)Rnd.RandRange(0, 255); if (ClassifyBytes(G).Kind == EFileKind::Envelope || ClassifyBytes(G).Kind == EFileKind::LegacyValid) ++GarbageAccepted; }
	TestEqual(TEXT("1500 random buffers: none accepted"), GarbageAccepted, 0);
	for (int32 i = 0; i < 100; ++i) { TArray<uint8> G; G.SetNum(Rnd.RandRange(1, 2600)); for (uint8& B : G) B = (uint8)Rnd.RandRange(0, 255); Write(G); TestTrue(TEXT("random garbage loads safely"), LoadIsSafe(F, R)); }
	// garbage that merely STARTS like a valid legacy save (the dangerous case: right header, destroyed property stream)
	for (int32 i = 0; i < 100; ++i) { TArray<uint8> G = Leg; const int32 Start = Rnd.RandRange(1900, Leg.Num() - 6); for (int32 k = Start; k < Leg.Num(); ++k) G[k] = (uint8)Rnd.RandRange(0, 255); Write(G); TestTrue(TEXT("valid-header + garbage stream loads safely"), LoadIsSafe(F, R)); }
	CleanSlot(); return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRSaveModifiedTest, "MoonRacer.AvatarSave.Malformed.ModifiedPayloadAndChecksum", TestFlags)
bool FMRSaveModifiedTest::RunTest(const FString&)
{
	FFix F; MakeFix(F); FMRAvatarLoadReport R; FString Err;
	F.S->SaveAppearance(Good(F.Cat), Err); const TArray<uint8> Env = Read();
	FRandomStream Rnd(99);

	// ENVELOPE: any modification is caught by length/CRC before the engine sees it.
	int32 EnvAccepted = 0;
	for (int32 i = 0; i < 1500; ++i) { TArray<uint8> M = Env; const int32 K = Rnd.RandRange(0, M.Num() - 1); M[K] ^= (uint8)(1 << Rnd.RandRange(0, 7)); if (ClassifyBytes(M).Kind == EFileKind::Envelope) ++EnvAccepted; }
	TestEqual(TEXT("1500 single-bit flips of an envelope: none accepted"), EnvAccepted, 0);
	int32 EnvMulti = 0;
	for (int32 i = 0; i < 1500; ++i) { TArray<uint8> M = Env; const int32 K = Rnd.RandRange(16, M.Num() - 9); for (int32 j = 0; j < Rnd.RandRange(1, 8); ++j) M[K + j] = (uint8)Rnd.RandRange(0, 255); if (ClassifyBytes(M).Kind == EFileKind::Envelope && M != Env) ++EnvMulti; }
	TestEqual(TEXT("1500 multi-byte payload edits: none accepted"), EnvMulti, 0);

	// incorrect checksum
	TArray<uint8> Payload; Payload.Append(Env.GetData() + 16, Env.Num() - 16);
	Write(MakeEnvelope(Payload, EnvelopeFormat, TOptional<uint32>(0x12345678u)));
	TestEqual(TEXT("wrong CRC classified as bad envelope"), (int32)ClassifyFile(Path()).Kind, (int32)EFileKind::EnvelopeBad);
	TestTrue(TEXT("wrong CRC: loads safely, flagged, preserved"), LoadIsSafe(F, R) && R.bRejectedMalformed && R.IntegrityDetail.Contains(TEXT("checksum")));

	// a payload with a CORRECT checksum but garbage inside (buggy writer): structural validation still stops it
	TArray<uint8> Garbage; Garbage.SetNum(600); for (uint8& B : Garbage) B = (uint8)Rnd.RandRange(0, 255);
	Write(MakeEnvelope(Garbage)); TestEqual(TEXT("valid CRC over garbage payload rejected"), (int32)ClassifyFile(Path()).Kind, (int32)EFileKind::EnvelopeBad);
	TestTrue(TEXT("...and loads safely"), LoadIsSafe(F, R) && R.bRejectedMalformed);
	TArray<uint8> Broken = Payload; for (int32 k = Broken.Num() - 120; k < Broken.Num() - 8; ++k) Broken[k] = (uint8)Rnd.RandRange(0, 255);
	Write(MakeEnvelope(Broken)); TestTrue(TEXT("valid CRC over a destroyed property stream loads safely"), LoadIsSafe(F, R) && R.bRejectedMalformed);

	// LEGACY: modified bytes. Structural damage must be rejected; harmless value changes may be accepted, but then the REAL engine load must be safe.
	CleanSlot(); MakeFix(F);
	const TArray<uint8> Leg = WriteLegacy(Good(F.Cat));
	int32 Accepted = 0, Rejected = 0;
	for (int32 i = 0; i < 600; ++i)
	{
		TArray<uint8> M = Leg; const int32 Mode = i % 3;
		if (Mode == 0) { M[Rnd.RandRange(0, M.Num() - 1)] ^= (uint8)(1 << Rnd.RandRange(0, 7)); }
		else if (Mode == 1) { const int32 K = Rnd.RandRange(1900, M.Num() - 9); for (int32 j = 0; j < Rnd.RandRange(1, 8); ++j) M[K + j] = (uint8)Rnd.RandRange(0, 255); }
		else { const int32 K = Rnd.RandRange(0, M.Num() - 4); for (int32 j = 0; j < 4; ++j) M[K + j] = 0xFF; }
		Write(M);
		const bool bSafe = LoadIsSafe(F, R); // would crash the process if an unsafe file reached the engine
		TestTrue(TEXT("every modified legacy file loads to a valid appearance"), bSafe);
		(R.bRejectedMalformed ? Rejected : Accepted)++;
	}
	AddInfo(FString::Printf(TEXT("legacy mutation fuzz: %d accepted (harmless edits) / %d rejected; no crash"), Accepted, Rejected));
	TestTrue(TEXT("most structural damage is rejected"), Rejected > Accepted / 4);

	// the original crash vector: an over-long name length inside an otherwise valid stream
	TArray<uint8> V = Leg; const FString Needle = TEXT("Appearance"); int32 At = INDEX_NONE;
	for (int32 i = 4; i + 10 < V.Num(); ++i) { if (FMemory::Memcmp(V.GetData() + i, "Appearance", 10) == 0) { At = i - 4; break; } }
	if (TestTrue(TEXT("found property name in the legacy file"), At != INDEX_NONE)) { const int32 Huge = 5000; FMemory::Memcpy(V.GetData() + At, &Huge, 4); Write(V); TestTrue(TEXT("over-long name length rejected, no crash"), LoadIsSafe(F, R) && R.bRejectedMalformed); }
	CleanSlot(); return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRSaveVersionTest, "MoonRacer.AvatarSave.Versions.UnsupportedFutureVersionsPreserved", TestFlags)
bool FMRSaveVersionTest::RunTest(const FString&)
{
	FFix F; MakeFix(F); FMRAvatarLoadReport R; FString Err;
	F.S->SaveAppearance(Good(F.Cat), Err);
	TArray<uint8> Payload; { const TArray<uint8> E = Read(); Payload.Append(E.GetData() + 16, E.Num() - 16); }

	// (a) future ENVELOPE format
	const TArray<uint8> Fut = Envelope(Payload, EnvelopeFormat + 1); Write(Fut);
	TestEqual(TEXT("future envelope format rejected"), (int32)ClassifyFile(Path()).Kind, (int32)EFileKind::EnvelopeBad);
	TestTrue(TEXT("loads safely"), LoadIsSafe(F, R) && R.bRejectedMalformed && R.IntegrityDetail.Contains(TEXT("unsupported")));
	TestTrue(TEXT("file untouched by load"), Equal(Read(), Fut));

	// (b) future SaveVersion INSIDE a valid envelope
	CleanSlot(); MakeFix(F);
	UMRAvatarSaveGame* O = NewObject<UMRAvatarSaveGame>(GetTransientPackage()); O->SaveVersion = MRAvatarSave::CurrentSaveVersion + 5; O->Appearance = Good(F.Cat);
	TArray<uint8> P2; UGameplayStatics::SaveGameToMemory(O, P2); const TArray<uint8> FutEnv = Envelope(P2); Write(FutEnv);
	TestTrue(TEXT("future save version: default used, flagged, no crash"), LoadIsSafe(F, R) && R.bRejectedNewerVersion);
	const int32 Ev0 = F.SavedEvents;
	TestTrue(TEXT("saving refuses to overwrite a newer-version save"), !F.S->SaveAppearance(Good(F.Cat), Err) && Err.Contains(TEXT("newer")));
	TestTrue(TEXT("newer-version file untouched"), Equal(Read(), FutEnv));
	TestEqual(TEXT("no saved event for the refused save"), F.SavedEvents, Ev0);

	// (c) future SaveVersion in a LEGACY file
	CleanSlot(); MakeFix(F);
	const TArray<uint8> FutLeg = WriteLegacy(Good(F.Cat), MRAvatarSave::CurrentSaveVersion + 3);
	TestTrue(TEXT("legacy future version: safe default"), LoadIsSafe(F, R) && R.bRejectedNewerVersion);
	TestTrue(TEXT("refuses to overwrite"), !F.S->SaveAppearance(Good(F.Cat), Err) && Equal(Read(), FutLeg));
	CleanSlot(); return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRSaveInterruptedTest, "MoonRacer.AvatarSave.Writes.InterruptedWritesKeepPreviousSave", TestFlags)
bool FMRSaveInterruptedTest::RunTest(const FString&)
{
	FFix F; MakeFix(F); FMRAvatarLoadReport R; FString Err;
	const FMRAvatarAppearance A1 = Good(F.Cat, 5);
	TestTrue(TEXT("first save"), F.S->SaveAppearance(A1, Err));
	const TArray<uint8> Before = Read();

	// (a) a leftover half-written temp file next to a valid save (crash mid-write earlier) is ignored.
	TArray<uint8> Half; Half.Append(Before.GetData(), Before.Num() / 2); FFileHelper::SaveArrayToFile(Half, *(Path() + TEXT(".tmp")));
	TestTrue(TEXT("leftover partial temp ignored; previous save loads"), F.S->LoadAppearance(R) == A1 && R.bFoundSave);

	// (b) interruption AFTER the temp file is written but BEFORE it replaces the target.
	GFailAfterTempWrite = true;
	const int32 Events = F.SavedEvents;
	TestFalse(TEXT("interrupted save reports failure"), F.S->SaveAppearance(Good(F.Cat, 6), Err));
	GFailAfterTempWrite = false;
	TestTrue(TEXT("previous valid save is untouched (byte-identical)"), Equal(Read(), Before));
	TestTrue(TEXT("previous save still loads"), F.S->LoadAppearance(R) == A1);
	TestEqual(TEXT("no saved event for the failed save"), F.SavedEvents, Events);

	// (c) the next save completes normally and leaves no temp file.
	const FMRAvatarAppearance A3 = Good(F.Cat, 7);
	TestTrue(TEXT("next save succeeds"), F.S->SaveAppearance(A3, Err));
	TestTrue(TEXT("new data loads, temp cleaned"), F.S->LoadAppearance(R) == A3 && !IFileManager::Get().FileExists(*(Path() + TEXT(".tmp"))));

	// (d) interrupted FIRST write: nothing appears as a save.
	CleanSlot(); MakeFix(F); GFailAfterTempWrite = true;
	TestFalse(TEXT("interrupted first save fails"), F.S->SaveAppearance(Good(F.Cat), Err)); GFailAfterTempWrite = false;
	TestFalse(TEXT("no save file was created"), IFileManager::Get().FileExists(*Path()));
	FMRAvatarLoadReport R2; TestTrue(TEXT("loads the default safely"), LoadIsSafe(F, R2) && !R2.bFoundSave && !R2.bRejectedMalformed);
	CleanSlot(); return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRSavePreserveTest, "MoonRacer.AvatarSave.Writes.NothingUnrecognisedIsDestroyed", TestFlags)
bool FMRSavePreserveTest::RunTest(const FString&)
{
	FFix F; MakeFix(F); FString Err;
	// a corrupt file occupying the slot is preserved when a new save replaces it
	const TArray<uint8> Junk = { 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 }; Write(Junk);
	TestTrue(TEXT("save over a corrupt file succeeds"), F.S->SaveAppearance(Good(F.Cat), Err));
	TArray<uint8> Bak; FFileHelper::LoadFileToArray(Bak, *(Path() + TEXT(".legacy.bak")));
	TestTrue(TEXT("corrupt file preserved as .legacy.bak"), Equal(Bak, Junk));
	TestEqual(TEXT("slot now holds a valid envelope"), (int32)ClassifyFile(Path()).Kind, (int32)EFileKind::Envelope);

	// deleting a legacy save moves it aside instead of destroying it
	CleanSlot(); MakeFix(F);
	const TArray<uint8> Leg = WriteLegacy(Good(F.Cat));
	TestTrue(TEXT("delete legacy"), F.S->DeleteSavedAppearance());
	TestFalse(TEXT("main file gone"), IFileManager::Get().FileExists(*Path()));
	TArray<uint8> Bak2; FFileHelper::LoadFileToArray(Bak2, *(Path() + TEXT(".legacy.bak")));
	TestTrue(TEXT("legacy data preserved aside"), Equal(Bak2, Leg));
	CleanSlot(); return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRSaveIsolationTest, "MoonRacer.AvatarSave.Isolation.DedicatedSlotsOnly", TestFlags)
bool FMRSaveIsolationTest::RunTest(const FString&)
{
	CleanSlot();
	const FString Default = FPaths::ProjectSavedDir() / TEXT("SaveGames") / TEXT("MRAvatar_Local.sav");
	const bool bDefaultExisted = IFileManager::Get().FileExists(*Default);
	TArray<uint8> Before; if (bDefaultExisted) FFileHelper::LoadFileToArray(Before, *Default);
	FFix F; MakeFix(F); FString Err;
	F.S->SaveAppearance(Good(F.Cat), Err);
	TestTrue(TEXT("test slot name is dedicated"), UMRAvatarSaveSubsystem::GetSlotName() == TestSlot);
	TestEqual(TEXT("default slot existence unchanged"), IFileManager::Get().FileExists(*Default), bDefaultExisted);
	if (bDefaultExisted) { TArray<uint8> After; FFileHelper::LoadFileToArray(After, *Default); TestTrue(TEXT("default slot bytes unchanged"), Before == After); }
	CleanSlot(); return true;
}

#endif // WITH_DEV_AUTOMATION_TESTS
