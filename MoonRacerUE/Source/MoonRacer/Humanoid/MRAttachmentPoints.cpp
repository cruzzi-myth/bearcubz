#include "Humanoid/MRAttachmentPoints.h"

const FMRAttachmentPointDef* UMRAttachmentPointSet::FindPoint(FName PointId) const
{
	return Points.FindByPredicate([PointId](const FMRAttachmentPointDef& P) { return P.PointId == PointId; });
}
