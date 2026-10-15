import { useEffect, useState } from "react";
import { fetchImagesConfig } from "../api";

/**
 * Whether this deployment bound an R2 bucket for logos and avatars.
 *
 * It assumes yes until told otherwise: an unreadable flag must not hide the
 * upload control from someone whose bucket is fine — if the bucket really is
 * missing, the upload says so at the point it matters.
 */
export function useImagesConfigured(): boolean {
  const [configured, setConfigured] = useState(true);

  useEffect(() => {
    let live = true;
    fetchImagesConfig()
      .then((config) => {
        if (live) {
          setConfigured(config.configured);
        }
      })
      .catch(() => {
        // Nothing to do: the default above is the answer we keep.
      });
    return () => {
      live = false;
    };
  }, []);

  return configured;
}
