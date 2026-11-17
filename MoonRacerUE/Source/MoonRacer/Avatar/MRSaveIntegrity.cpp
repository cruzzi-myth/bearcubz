#include "Avatar/MRSaveIntegrity.h"
#include "HAL/FileManager.h"
#include "Misc/Crc.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Serialization/CustomVersion.h"

namespace MRSaveIntegrity
{
	bool GFailAfterTempWrite = false;

	namespace
	{
		struct FReader
		{
			const TArray<uint8>& B; int64 P = 0; bool bOk = true;
			explicit FReader(const TArray<uint8>& InB) : B(InB) {}
			bool Need(int64 N) { if (!bOk || N < 0 || P + N > B.Num()) { bOk = false; return false; } return true; }
			int32 I32() { if (!Need(4)) return 0; int32 V; FMemory::Memcpy(&V, B.GetData() + P, 4); P += 4; return V; }
			uint8 U8() { if (!Need(1)) return 0; return B[P++]; }
			void Skip(int64 N) { if (Need(N)) P += N; }
			// FString as written by the engine: int32 length (including terminator); >0 ANSI, <0 UTF-16. Only short printable ANSI is accepted.
			bool Str(FString& Out, int32 MaxChars = 1023)
			{
				const int32 N = I32(); if (!bOk) return false;
				if (N == 0) { Out.Empty(); return true; }
				if (N < 0 || N > MaxChars + 1) { bOk = false; return false; }   // wide strings and over-long strings are never accepted
				if (!Need(N)) return false;
				for (int32 i = 0; i < N - 1; ++i) { const uint8 C = B[P + i]; if (C < 32 || C > 126) { bOk = false; return false; } }
				if (B[P + N - 1] != 0) { bOk = false; return false; }
				Out = FString(N - 1, reinterpret_cast<const ANSICHAR*>(B.GetData() + P));
				P += N; return true;
			}
		};

		// Property names/types this save class actually contains. Anything else is rejected (strict whitelist).
		const TMap<FString, FString>& TopProps()
		{
			static const TMap<FString, FString> M = { {TEXT("SaveVersion"), TEXT("IntProperty")}, {TEXT("Appearance"), TEXT("StructProperty")}, {TEXT("LegacySpecies"), TEXT("NameProperty")},
				{TEXT("LegacyAccessory"), TEXT("NameProperty")}, {TEXT("Notice"), TEXT("StrProperty")} };
			return M;
		}
		const TMap<FString, FString>& AppearanceProps()
		{
			static const TMap<FString, FString> M = { {TEXT("SchemaVersion"), TEXT("IntProperty")}, {TEXT("AvatarId"), TEXT("StructProperty")}, {TEXT("SpeciesId"), TEXT("NameProperty")},
				{TEXT("BodyBaseId"), TEXT("NameProperty")}, {TEXT("HairId"), TEXT("NameProperty")}, {TEXT("EyesId"), TEXT("NameProperty")}, {TEXT("OutfitId"), TEXT("NameProperty")},
				{TEXT("AccessoryIds"), TEXT("ArrayProperty")}, {TEXT("SignalAccentId"), TEXT("NameProperty")}, {TEXT("MaterialVariantId"), TEXT("NameProperty")}, {TEXT("Revision"), TEXT("IntProperty")} };
			return M;
		}

		struct FTypeNode { FString Name; int32 Inner = 0; };

		bool ReadTypeName(FReader& R, TArray<FTypeNode>& Out)
		{
			int32 Remaining = 1;
			while (Remaining > 0)
			{
				FTypeNode N; if (!R.Str(N.Name, 255)) return false; N.Inner = R.I32(); if (!R.bOk) return false;
				if (N.Inner < 0 || N.Inner > 4 || Out.Num() >= 8) return false;
				Out.Add(N); Remaining += N.Inner - 1;
			}
			return true;
		}

		// A sequence of tagged properties terminated by "None". Validates names/types/sizes exactly; nested structs recurse.
		bool ReadTags(FReader& R, int64 End, int32 Depth, const TMap<FString, FString>& Allowed, int32& Budget, FString& Why)
		{
			if (Depth > 3) { Why = TEXT("nesting too deep"); return false; }
			TSet<FString> Seen;
			while (true)
			{
				if (--Budget < 0) { Why = TEXT("too many properties"); return false; }
				FString Name; if (!R.Str(Name, 255)) { Why = TEXT("bad property name"); return false; }
				if (Name == TEXT("None")) return true;
				const FString* Expected = Allowed.Find(Name);
				if (!Expected) { Why = FString::Printf(TEXT("unknown property '%s'"), *Name); return false; }
				if (Seen.Contains(Name)) { Why = TEXT("duplicate property"); return false; }
				Seen.Add(Name);
				TArray<FTypeNode> Type; if (!ReadTypeName(R, Type) || Type.Num() == 0) { Why = TEXT("bad property type"); return false; }
				if (Type[0].Name != *Expected) { Why = FString::Printf(TEXT("property '%s' has unexpected type"), *Name); return false; }
				const int32 Size = R.I32(); const uint8 Flags = R.U8(); if (!R.bOk) { Why = TEXT("truncated tag"); return false; }
				if (Size < 0 || R.P + Size > End) { Why = TEXT("property size out of range"); return false; }
				if (Flags & ~0x1B) { Why = TEXT("unsupported tag flags"); return false; }   // property extensions / skipped serialization are never written by this class
				if (Flags & 0x01) { const int32 Idx = R.I32(); if (Idx < 0 || Idx > 1024) { Why = TEXT("bad array index"); return false; } }
				if (Flags & 0x02) R.Skip(16);
				const int64 Start = R.P;
				const FString& Root = Type[0].Name;
				if (Root == TEXT("IntProperty")) { if (Size != 4) { Why = TEXT("int size"); return false; } R.Skip(4); }
				else if (Root == TEXT("NameProperty") || Root == TEXT("StrProperty")) { FString S; if (!R.Str(S, Root == TEXT("StrProperty") ? 1023 : 1023) || R.P - Start != Size) { Why = TEXT("bad string value"); return false; } }
				else if (Root == TEXT("StructProperty"))
				{
					if (Flags & 0x08) // native binary: only FGuid is expected
					{
						if (Type.Num() < 2 || Type[1].Name != TEXT("Guid") || Size != 16) { Why = TEXT("unexpected native struct"); return false; }
						R.Skip(16);
					}
					else
					{
						if (Type.Num() < 2 || Type[1].Name != TEXT("MRAvatarAppearance")) { Why = TEXT("unexpected struct"); return false; }
						if (!ReadTags(R, Start + Size, Depth + 1, AppearanceProps(), Budget, Why)) return false;
						if (R.P - Start != Size) { Why = TEXT("struct size mismatch"); return false; }
					}
				}
				else if (Root == TEXT("ArrayProperty"))
				{
					if (Type.Num() < 2 || Type[1].Name != TEXT("NameProperty")) { Why = TEXT("unexpected array type"); return false; }
					const int32 N = R.I32(); if (!R.bOk || N < 0 || N > 64) { Why = TEXT("bad array count"); return false; }
					for (int32 i = 0; i < N; ++i) { FString S; if (!R.Str(S, 1023)) { Why = TEXT("bad array element"); return false; } }
					if (R.P - Start != Size) { Why = TEXT("array size mismatch"); return false; }
				}
				else { Why = TEXT("unsupported property type"); return false; }
				if (!R.bOk) { Why = TEXT("truncated property"); return false; }
			}
		}
	}

	bool ValidateLegacyAvatarSave(const TArray<uint8>& Bytes, FString& Why)
	{
		if (Bytes.Num() < 64 || (uint32)Bytes.Num() > MaxPayloadBytes) { Why = TEXT("size out of range"); return false; }
		FReader R(Bytes);
		if (R.I32() != 0x53415647) { Why = TEXT("not an engine save (no GVAS tag)"); return false; }
		if (R.I32() != 3) { Why = TEXT("unsupported engine save file version"); return false; }
		R.Skip(8);                  // FPackageFileVersion (UE4, UE5)
		R.Skip(10);                 // FEngineVersion: major, minor, patch (u16), changelist (u32)
		FString Branch; if (!R.Str(Branch, 255)) { Why = TEXT("bad engine branch"); return false; }
		if (R.I32() != 3) { Why = TEXT("unsupported custom version format"); return false; }
		const int32 NumCustom = R.I32(); if (!R.bOk || NumCustom < 0 || NumCustom > 1024) { Why = TEXT("bad custom version count"); return false; }
		for (int32 i = 0; i < NumCustom; ++i)
		{
			if (!R.Need(20)) { Why = TEXT("truncated custom versions"); return false; }
			uint32 G[4]; FMemory::Memcpy(G, Bytes.GetData() + R.P, 16); R.Skip(16);
			const int32 Ver = R.I32();
			const TOptional<FCustomVersion> Known = FCurrentCustomVersions::Get(FGuid(G[0], G[1], G[2], G[3]));
			if (!Known.IsSet() || Ver < 0 || Ver > Known->Version) { Why = TEXT("unknown or invalid custom version entry"); return false; }
		}
		FString ClassName; if (!R.Str(ClassName, 255) || ClassName != TEXT("/Script/MoonRacer.MRAvatarSaveGame")) { Why = TEXT("not an avatar save"); return false; }
		if (R.U8() != 0) { Why = TEXT("unsupported class serialization extensions"); return false; }
		int32 Budget = 256;
		if (!ReadTags(R, Bytes.Num(), 0, TopProps(), Budget, Why)) return false;
		if (R.Need(4) == false || Bytes.Num() - R.P != 4 || R.I32() != 0) { Why = TEXT("unexpected trailing data"); return false; }
		if (!R.bOk) { Why = TEXT("truncated"); return false; }
		return true;
	}

	TArray<uint8> MakeEnvelope(const TArray<uint8>& Payload, uint32 Format, TOptional<uint32> ForcedCrc)
	{
		TArray<uint8> File; File.SetNumUninitialized(16 + Payload.Num());
		const uint32 H[4] = { AvatarMagic, Format, (uint32)Payload.Num(), ForcedCrc.IsSet() ? ForcedCrc.GetValue() : FCrc::MemCrc32(Payload.GetData(), Payload.Num()) };
		FMemory::Memcpy(File.GetData(), H, 16);
		if (Payload.Num()) FMemory::Memcpy(File.GetData() + 16, Payload.GetData(), Payload.Num());
		return File;
	}

	FClassified ClassifyBytes(const TArray<uint8>& Bytes)
	{
		FClassified C;
		if (Bytes.Num() == 0) { C.Kind = EFileKind::Garbage; C.Why = TEXT("empty file"); return C; }
		uint32 First = 0; if (Bytes.Num() >= 4) FMemory::Memcpy(&First, Bytes.GetData(), 4);
		if (First == AvatarMagic)
		{
			if (Bytes.Num() < 16) { C.Kind = EFileKind::EnvelopeBad; C.Why = TEXT("truncated envelope header"); return C; }
			uint32 H[4]; FMemory::Memcpy(H, Bytes.GetData(), 16);
			if (H[1] != EnvelopeFormat) { C.Kind = EFileKind::EnvelopeBad; C.Why = FString::Printf(TEXT("unsupported envelope format %u"), H[1]); return C; }
			if (H[2] == 0 || H[2] > MaxPayloadBytes || (int64)H[2] != (int64)Bytes.Num() - 16) { C.Kind = EFileKind::EnvelopeBad; C.Why = TEXT("bad payload length (truncated or padded)"); return C; }
			if (FCrc::MemCrc32(Bytes.GetData() + 16, H[2]) != H[3]) { C.Kind = EFileKind::EnvelopeBad; C.Why = TEXT("checksum mismatch"); return C; }
			TArray<uint8> Payload; Payload.Append(Bytes.GetData() + 16, (int32)H[2]);
			// Defence in depth: a payload that passes the CRC (e.g. written by a buggy writer) must still be structurally sound.
			FString Why;
			if (!ValidateLegacyAvatarSave(Payload, Why)) { C.Kind = EFileKind::EnvelopeBad; C.Why = TEXT("payload failed structural validation: ") + Why; return C; }
			C.Kind = EFileKind::Envelope; C.Payload = MoveTemp(Payload); return C;
		}
		if (First == 0x53415647) // 'GVAS' engine save written by Phase 3A
		{
			FString Why;
			if (ValidateLegacyAvatarSave(Bytes, Why)) { C.Kind = EFileKind::LegacyValid; C.Payload = Bytes; return C; }
			C.Kind = EFileKind::LegacyUnverifiable; C.Why = Why; return C;
		}
		C.Kind = EFileKind::Garbage; C.Why = TEXT("unrecognised file"); return C;
	}

	FClassified ClassifyFile(const FString& Path)
	{
		FClassified C;
		if (!IFileManager::Get().FileExists(*Path)) { C.Kind = EFileKind::Missing; return C; }
		TArray<uint8> Bytes;
		if (!FFileHelper::LoadFileToArray(Bytes, *Path)) { C.Kind = EFileKind::Unreadable; C.Why = TEXT("could not read file"); return C; }
		return ClassifyBytes(Bytes);
	}

	bool PreserveUnrecognized(const FString& Path, FString& Err)
	{
		if (!IFileManager::Get().FileExists(*Path)) return true;
		TArray<uint8> Bytes;
		if (!FFileHelper::LoadFileToArray(Bytes, *Path)) { Err = TEXT("could not read the existing file to preserve it"); return false; }
		if (ClassifyBytes(Bytes).Kind == EFileKind::Envelope) return true;   // a valid current-format save is replaced atomically, not backed up
		// Back up under a name that never collides; identical content is not duplicated.
		for (int32 i = 0; i < 1000; ++i)
		{
			const FString Bak = Path + (i == 0 ? TEXT(".legacy.bak") : *FString::Printf(TEXT(".legacy.%d.bak"), i));
			if (!IFileManager::Get().FileExists(*Bak)) { if (FFileHelper::SaveArrayToFile(Bytes, *Bak)) return true; Err = TEXT("could not write the backup"); return false; }
			TArray<uint8> Existing; if (FFileHelper::LoadFileToArray(Existing, *Bak) && Existing == Bytes) return true;
		}
		Err = TEXT("too many backups"); return false;
	}

	bool WriteEnvelopeAtomic(const FString& Path, const TArray<uint8>& Payload, FString& Err)
	{
		if (Payload.Num() == 0 || (uint32)Payload.Num() > MaxPayloadBytes) { Err = TEXT("payload size out of range"); return false; }
		IFileManager::Get().MakeDirectory(*FPaths::GetPath(Path), true);
		const FString Tmp = Path + TEXT(".tmp");
		const TArray<uint8> File = MakeEnvelope(Payload);
		if (!FFileHelper::SaveArrayToFile(File, *Tmp)) { Err = TEXT("could not write the temporary file"); return false; }
		// Verify the temp file before it is allowed to replace anything.
		if (ClassifyFile(Tmp).Kind != EFileKind::Envelope) { IFileManager::Get().Delete(*Tmp, false, true, true); Err = TEXT("temporary file failed read-back verification"); return false; }
		if (GFailAfterTempWrite) { Err = TEXT("simulated interruption after the temporary file was written"); return false; } // leaves .tmp behind, like a crash would
		if (!PreserveUnrecognized(Path, Err)) { IFileManager::Get().Delete(*Tmp, false, true, true); return false; }
		if (!IFileManager::Get().Move(*Path, *Tmp, /*Replace*/ true, /*EvenIfReadOnly*/ true)) { IFileManager::Get().Delete(*Tmp, false, true, true); Err = TEXT("atomic replace failed; previous file left intact"); return false; }
		return true;
	}
}
