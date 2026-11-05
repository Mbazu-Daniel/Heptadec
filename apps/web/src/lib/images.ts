import { useEffect, useState } from "react";
import { fetchImagesConfig } from "../api";

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
