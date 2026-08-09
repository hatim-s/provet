import type { NormalizedTrajectoryEvent } from "../events/normalized-trajectory-event.js";
import type { TrialIdentity } from "../execution/run-plan.js";
import type { PublicSchemaVersion } from "../versioning/schema-version.js";
import type { SerializedJsonValue } from "../versioning/serialized-json-value.js";
import type { AdapterKind } from "./adapter-configuration.js";
import type { InvocationMeasurements } from "./invocation-measurements.js";

interface AdapterProvenance {
  adapterKind: AdapterKind;
  detectedVersion: string | null;
  rawEventFormat: string;
}

type RequestedNetworkAccess =
  | "configured-destination-only"
  | "denied"
  | "unrestricted";

type RequestedWorkspaceAccess = "none" | "read-only" | "read-write";

/** Names the known unsafe profile without pre-approving any stronger profile. */
type ExecutionProfile =
  | {
      isolationEnforcement: "none";
      type: "unsafe-local";
    }
  | {
      isolationEnforcement: "unknown";
      name: string;
      type: "named";
    }
  | {
      isolationEnforcement: "verified";
      name: string;
      type: "named";
    };

/** Keeps requested policy, observed enforcement, and effective network access distinct. */
type NetworkCapabilityState =
  | {
      effectiveNetworkAccess: "configured-destination-only";
      networkEnforcement: "enforced";
      requestedNetworkAccess: "configured-destination-only";
    }
  | {
      effectiveNetworkAccess: "denied";
      networkEnforcement: "enforced";
      requestedNetworkAccess: "denied";
    }
  | {
      effectiveNetworkAccess: "unrestricted";
      networkEnforcement: "not-required";
      requestedNetworkAccess: "unrestricted";
    }
  | {
      effectiveNetworkAccess: "unrestricted";
      networkEnforcement: "unenforced";
      requestedNetworkAccess: "unrestricted";
    }
  | {
      effectiveNetworkAccess: "unknown";
      networkEnforcement: "unknown";
      requestedNetworkAccess: RequestedNetworkAccess;
    };

/** Keeps the logical workspace request separate from unenforced ambient host access. */
type WorkspaceCapabilityState =
  | {
      effectiveWorkspaceAccess: RequestedWorkspaceAccess;
      requestedWorkspaceAccess: RequestedWorkspaceAccess;
      workspaceEnforcement: "enforced";
    }
  | {
      effectiveWorkspaceAccess: "unrestricted";
      requestedWorkspaceAccess: RequestedWorkspaceAccess;
      workspaceEnforcement: "unenforced";
    }
  | {
      effectiveWorkspaceAccess: "unknown";
      requestedWorkspaceAccess: RequestedWorkspaceAccess;
      workspaceEnforcement: "unknown";
    };

interface TargetCapabilityRequirement {
  isolation: "none" | "required";
  networkAccess: RequestedNetworkAccess;
  workspaceAccess: RequestedWorkspaceAccess;
}

interface UnsafeLocalTargetCapabilityGrant {
  executionProfile: Extract<ExecutionProfile, { type: "unsafe-local" }>;
  network: Extract<
    NetworkCapabilityState,
    {
      effectiveNetworkAccess: "unrestricted";
      networkEnforcement: "unenforced";
      requestedNetworkAccess: "unrestricted";
    }
  >;
  workspace: Extract<
    WorkspaceCapabilityState,
    {
      effectiveWorkspaceAccess: "unrestricted";
      workspaceEnforcement: "unenforced";
    }
  >;
}

interface NamedProfileTargetCapabilityGrant {
  executionProfile: Extract<
    ExecutionProfile,
    { isolationEnforcement: "verified"; type: "named" }
  >;
  network: Exclude<
    NetworkCapabilityState,
    { networkEnforcement: "unenforced" | "unknown" }
  >;
  workspace: Extract<
    WorkspaceCapabilityState,
    { workspaceEnforcement: "enforced" }
  >;
}

/** Describes only a compatible, truthfully observed capability state. */
type TargetCapabilityGrant =
  | NamedProfileTargetCapabilityGrant
  | UnsafeLocalTargetCapabilityGrant;

/** Makes an unenforceable or unknown requirement a non-invokable planning result. */
type TargetCapabilityCompatibility =
  | {
      compatible: false;
      executionProfile: ExecutionProfile;
      observedNetwork: NetworkCapabilityState;
      observedWorkspace: WorkspaceCapabilityState;
      reason:
        | "isolation-unverified"
        | "network-enforcement-unavailable"
        | "workspace-enforcement-unavailable";
      requirement: TargetCapabilityRequirement;
    }
  | {
      compatible: true;
      grant: TargetCapabilityGrant;
    };

interface TrialWorkspaceReference {
  path: string;
}

interface TargetInvocationRequest {
  capabilityGrant: TargetCapabilityGrant;
  input: string;
  schemaVersion: PublicSchemaVersion;
  trial: TrialIdentity;
  workspace: TrialWorkspaceReference | null;
}

/** Gives a judge only redacted immutable evidence and never a target workspace. */
interface JudgeInvocationRequest {
  caseInput: string;
  evidence: RedactedJudgeEvidence;
  judgeName: string;
  rubric: string;
  schemaVersion: PublicSchemaVersion;
  trial: TrialIdentity;
}

interface RedactedJudgeEvidence {
  finalOutput: string;
  trajectory: readonly NormalizedTrajectoryEvent[];
}

/** Preserves normalized and raw provider evidence until redaction/persistence policy runs. */
interface AdapterInvocationResult {
  measurements: InvocationMeasurements;
  output: string;
  provenance: AdapterProvenance;
  rawEvents: readonly SerializedJsonValue[];
  schemaVersion: PublicSchemaVersion;
  trajectory: readonly NormalizedTrajectoryEvent[];
}

interface TargetInvocationPort {
  invokeTarget(
    request: TargetInvocationRequest,
  ): Promise<AdapterInvocationResult>;
}

interface JudgeInvocationPort {
  invokeJudge(
    request: JudgeInvocationRequest,
  ): Promise<AdapterInvocationResult>;
}

export type {
  AdapterInvocationResult,
  AdapterProvenance,
  ExecutionProfile,
  JudgeInvocationPort,
  JudgeInvocationRequest,
  NetworkCapabilityState,
  RedactedJudgeEvidence,
  TargetCapabilityCompatibility,
  TargetCapabilityGrant,
  TargetCapabilityRequirement,
  TargetInvocationPort,
  TargetInvocationRequest,
  TrialWorkspaceReference,
  WorkspaceCapabilityState,
};
