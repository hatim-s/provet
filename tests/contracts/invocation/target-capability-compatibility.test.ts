import { describe, expect, test } from "bun:test";

import type {
  TargetCapabilityCompatibility,
  TargetCapabilityGrant,
} from "../../../src/contracts/invocation/invocation-port.js";

type AssertTrue<Condition extends true> = Condition;

type UnsafeLocalDeniedNetworkGrant = {
  executionProfile: {
    isolationEnforcement: "none";
    type: "unsafe-local";
  };
  network: {
    effectiveNetworkAccess: "denied";
    networkEnforcement: "enforced";
    requestedNetworkAccess: "denied";
  };
  workspace: {
    effectiveWorkspaceAccess: "unrestricted";
    requestedWorkspaceAccess: "read-write";
    workspaceEnforcement: "unenforced";
  };
};

type UnsafeLocalDestinationNetworkGrant = {
  executionProfile: {
    isolationEnforcement: "none";
    type: "unsafe-local";
  };
  network: {
    effectiveNetworkAccess: "configured-destination-only";
    networkEnforcement: "enforced";
    requestedNetworkAccess: "configured-destination-only";
  };
  workspace: {
    effectiveWorkspaceAccess: "unrestricted";
    requestedWorkspaceAccess: "read-write";
    workspaceEnforcement: "unenforced";
  };
};

type UnsafeLocalNoWorkspaceGrant = {
  executionProfile: {
    isolationEnforcement: "none";
    type: "unsafe-local";
  };
  network: {
    effectiveNetworkAccess: "unrestricted";
    networkEnforcement: "unenforced";
    requestedNetworkAccess: "unrestricted";
  };
  workspace: {
    effectiveWorkspaceAccess: "unrestricted";
    requestedWorkspaceAccess: "none";
    workspaceEnforcement: "unenforced";
  };
};

type UnsafeLocalReadOnlyWorkspaceGrant = {
  executionProfile: {
    isolationEnforcement: "none";
    type: "unsafe-local";
  };
  network: {
    effectiveNetworkAccess: "unrestricted";
    networkEnforcement: "unenforced";
    requestedNetworkAccess: "unrestricted";
  };
  workspace: {
    effectiveWorkspaceAccess: "unrestricted";
    requestedWorkspaceAccess: "read-only";
    workspaceEnforcement: "unenforced";
  };
};

type UnsafeLocalDenialIsNotGrantable = AssertTrue<
  UnsafeLocalDeniedNetworkGrant extends TargetCapabilityGrant ? false : true
>;
type UnsafeLocalDestinationIsNotGrantable = AssertTrue<
  UnsafeLocalDestinationNetworkGrant extends TargetCapabilityGrant
    ? false
    : true
>;
type UnsafeLocalNoWorkspaceIsNotGrantable = AssertTrue<
  UnsafeLocalNoWorkspaceGrant extends TargetCapabilityGrant ? false : true
>;
type UnsafeLocalReadOnlyWorkspaceIsNotGrantable = AssertTrue<
  UnsafeLocalReadOnlyWorkspaceGrant extends TargetCapabilityGrant ? false : true
>;

const unsafeLocalGrant = {
  executionProfile: {
    isolationEnforcement: "none",
    type: "unsafe-local",
  },
  network: {
    effectiveNetworkAccess: "unrestricted",
    networkEnforcement: "unenforced",
    requestedNetworkAccess: "unrestricted",
  },
  workspace: {
    effectiveWorkspaceAccess: "unrestricted",
    requestedWorkspaceAccess: "read-write",
    workspaceEnforcement: "unenforced",
  },
} as const satisfies TargetCapabilityGrant;

/** Builds the required fail-closed result for an unsafe-local network restriction. */
function createUnsafeLocalNetworkRejection(
  networkAccess: "configured-destination-only" | "denied",
): TargetCapabilityCompatibility {
  return {
    compatible: false,
    executionProfile: unsafeLocalGrant.executionProfile,
    observedNetwork: unsafeLocalGrant.network,
    observedWorkspace: unsafeLocalGrant.workspace,
    reason: "network-enforcement-unavailable",
    requirement: {
      isolation: "none",
      networkAccess,
      workspaceAccess: "read-write",
    },
  };
}

/** Builds the required fail-closed result for an unsafe-local workspace restriction. */
function createUnsafeLocalWorkspaceRejection(
  workspaceAccess: "none" | "read-only",
): TargetCapabilityCompatibility {
  return {
    compatible: false,
    executionProfile: unsafeLocalGrant.executionProfile,
    observedNetwork: unsafeLocalGrant.network,
    observedWorkspace: {
      effectiveWorkspaceAccess: "unrestricted",
      requestedWorkspaceAccess: workspaceAccess,
      workspaceEnforcement: "unenforced",
    },
    reason: "workspace-enforcement-unavailable",
    requirement: {
      isolation: "none",
      networkAccess: "unrestricted",
      workspaceAccess,
    },
  };
}

describe("target capability compatibility", () => {
  test("represents unsafe-local arbitrary egress without an enforcement claim", () => {
    expect(unsafeLocalGrant.network).toEqual({
      effectiveNetworkAccess: "unrestricted",
      networkEnforcement: "unenforced",
      requestedNetworkAccess: "unrestricted",
    });
    expect(unsafeLocalGrant.executionProfile).toEqual({
      isolationEnforcement: "none",
      type: "unsafe-local",
    });
  });

  test.each(["denied", "configured-destination-only"] as const)(
    "makes unsafe-local %s network planning incompatible",
    (networkAccess) => {
      const compatibility = createUnsafeLocalNetworkRejection(networkAccess);

      expect(compatibility.compatible).toBe(false);
      if (!compatibility.compatible) {
        expect(compatibility.reason).toBe("network-enforcement-unavailable");
        expect(compatibility.observedNetwork.effectiveNetworkAccess).toBe(
          "unrestricted",
        );
      }
    },
  );

  test.each(["none", "read-only"] as const)(
    "makes unsafe-local %s workspace planning incompatible",
    (workspaceAccess) => {
      const compatibility =
        createUnsafeLocalWorkspaceRejection(workspaceAccess);

      expect(compatibility.compatible).toBe(false);
      if (!compatibility.compatible) {
        expect(compatibility.reason).toBe("workspace-enforcement-unavailable");
        expect(compatibility.observedWorkspace).toEqual({
          effectiveWorkspaceAccess: "unrestricted",
          requestedWorkspaceAccess: workspaceAccess,
          workspaceEnforcement: "unenforced",
        });
      }
    },
  );

  test("represents an unverified profile as unknown and non-invokable", () => {
    const compatibility = {
      compatible: false,
      executionProfile: {
        isolationEnforcement: "unknown",
        name: "future-profile",
        type: "named",
      },
      observedNetwork: {
        effectiveNetworkAccess: "unknown",
        networkEnforcement: "unknown",
        requestedNetworkAccess: "denied",
      },
      observedWorkspace: {
        effectiveWorkspaceAccess: "unknown",
        requestedWorkspaceAccess: "read-write",
        workspaceEnforcement: "unknown",
      },
      reason: "isolation-unverified",
      requirement: {
        isolation: "required",
        networkAccess: "denied",
        workspaceAccess: "read-write",
      },
    } as const satisfies TargetCapabilityCompatibility;

    expect(compatibility.compatible).toBe(false);
    expect(compatibility.observedNetwork.effectiveNetworkAccess).toBe(
      "unknown",
    );
  });

  test("keeps hostile false-grant compile-time probes active", () => {
    const deniedProbe: UnsafeLocalDenialIsNotGrantable = true;
    const destinationProbe: UnsafeLocalDestinationIsNotGrantable = true;
    const noWorkspaceProbe: UnsafeLocalNoWorkspaceIsNotGrantable = true;
    const readOnlyWorkspaceProbe: UnsafeLocalReadOnlyWorkspaceIsNotGrantable = true;

    expect([
      deniedProbe,
      destinationProbe,
      noWorkspaceProbe,
      readOnlyWorkspaceProbe,
    ]).toEqual([true, true, true, true]);
  });
});
