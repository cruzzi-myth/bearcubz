// Moon Racer - avatar save integrity (Phase 3A maintenance).
//
// UGameplayStatics::LoadGameFromSlot / LoadGameFromMemory hard-assert (engine crash) on corrupted data: a garbled string length inside
// the tagged property stream reaches the FName pool and trips a checkf. So untrusted bytes must NEVER reach the engine deserialiser.
//
//  * CURRENT format: an integrity envelope  "MRAV" | u32 format | u32 payloadLen | u32 CRC32(payload) | payload
//    (payload = SaveGameToMemory bytes). Only a length- and CRC-verified payload is handed to the engine.
//  * LEGACY format (what Phase 3A wrote): a raw engine GVAS file with no checksum. It is trusted ONLY after FULL structural validation by
//    ValidateLegacyAvatarSave(): header, class name, known-property whitelist, bounded strings, exact sizes, exact end-of-file. Anything that
//    cannot be proven well-formed is rejected, never loaded, and always preserved on disk.
//  * Writes go to <file>.tmp, are read back and verified, then atomically renamed over the target. Any pre-existing file that is not a valid
//    current-format file is first copied to <file>.legacy.bak (never silently discarded or overwritten).

#pragma once

#include "CoreMinimal.h"

namespace MRSaveIntegrity
{
	constexpr uint32 AvatarMagic = 0x5641524D;   // 'M','R','A','V' (little endian)
	constexpr uint32 EnvelopeFormat = 1;
	constexpr uint32 MaxPayloadBytes = 1u << 20;

	enum class EFileKind : uint8
	{
		Missing, Unreadable,
		Envelope,            // valid current format (payload verified)
		EnvelopeBad,         // envelope magic present but length/CRC/format invalid
		LegacyValid,         // raw engine save proven well-formed
		LegacyUnverifiable,  // looks like an engine save but cannot be proven well-formed
		Garbage              // anything else (empty, truncated, random)
	};

	struct FClassified
	{
		EFileKind Kind = EFileKind::Missing;
		TArray<uint8> Payload;   // Envelope: verified payload. LegacyValid: the whole (validated) file.
		FString Why;
	};

	/** Classify a file without ever invoking the engine deserialiser. */
	MOONRACER_API FClassified ClassifyFile(const FString& Path);
	MOONRACER_API FClassified ClassifyBytes(const TArray<uint8>& Bytes);

	/** Strict structural validation of a raw engine save of UMRAvatarSaveGame. True only if provably well-formed. */
	MOONRACER_API bool ValidateLegacyAvatarSave(const TArray<uint8>& Bytes, FString& OutWhy);

	/** Atomic, verified write of an enveloped payload. Preserves any pre-existing non-envelope file as <path>.legacy.bak first. */
	MOONRACER_API bool WriteEnvelopeAtomic(const FString& Path, const TArray<uint8>& Payload, FString& OutError);

	/** Move a non-envelope file aside to <path>.legacy.bak instead of destroying it. Returns true if nothing needed preserving or it was preserved. */
	MOONRACER_API bool PreserveUnrecognized(const FString& Path, FString& OutError);

	/** Build an enveloped file image (used by tests to forge specific cases). */
	MOONRACER_API TArray<uint8> MakeEnvelope(const TArray<uint8>& Payload, uint32 Format = EnvelopeFormat, TOptional<uint32> ForcedCrc = TOptional<uint32>());

	/** TEST HOOK: simulate a crash/failure after the temp file is written but before it replaces the target. */
	MOONRACER_API extern bool GFailAfterTempWrite;
}
